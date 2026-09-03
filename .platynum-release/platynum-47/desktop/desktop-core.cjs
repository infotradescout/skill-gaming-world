const net = require("node:net");
const path = require("node:path");
const {
  desktopRuntimeEnvironment,
  isRuntimeUrl,
  isSafeExternalUrl,
  localOrigin,
  projectRoots,
} = require("./config.cjs");

function findFreeLoopbackPort(netApi = net) {
  return new Promise((resolve, reject) => {
    const probe = netApi.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address ? address.port : 0;
      probe.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

function createDesktopMain(dependencies) {
  const {
    app,
    BrowserWindow,
    dialog,
    ipcMain,
    shell,
    session,
    loadServer = () => import("../server.js"),
    findFreePort = findFreeLoopbackPort,
    pathApi = path,
  } = dependencies;

  let mainWindow = null;
  let runtimeServer = null;
  let runtimeModule = null;
  let runtimeOrigin = "";
  let shutdown = null;
  let started = false;

  function appPaths() {
    const appPath = app.getAppPath();
    const home = app.getPath("home");
    return {
      appPath,
      resourcesPath: process.resourcesPath || pathApi.dirname(appPath),
      isPackaged: Boolean(app.isPackaged),
      home,
      documents: app.getPath("documents"),
      desktop: app.getPath("desktop"),
      codexHome: pathApi.join(app.getPath("userData"), "codex"),
      recordDir: pathApi.join(app.getPath("userData"), "runs"),
    };
  }

  async function startRuntime() {
    const port = await findFreePort();
    const paths = appPaths();
    Object.assign(
      process.env,
      desktopRuntimeEnvironment({
        ...paths,
        port,
        projectRoots: projectRoots(paths),
      }),
    );
    runtimeModule = await loadServer();
    runtimeServer = await runtimeModule.startPlatynumServer({ port, host: "127.0.0.1" });
    const address = runtimeServer.address();
    const boundPort = typeof address === "object" && address ? address.port : port;
    runtimeOrigin = localOrigin(boundPort);
  }

  function openExternalIfSafe(url) {
    if (isSafeExternalUrl(url)) void shell.openExternal(url);
  }

  function createWindow() {
    const preload = pathApi.join(app.getAppPath(), "desktop", "preload.cjs");
    mainWindow = new BrowserWindow({
      title: "Platynum-47",
      width: 1440,
      height: 940,
      minWidth: 960,
      minHeight: 680,
      show: false,
      webPreferences: {
        preload,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
        webviewTag: false,
      },
    });
    mainWindow.once("ready-to-show", () => mainWindow?.show());
    mainWindow.webContents.on("will-navigate", (event, url) => {
      if (isRuntimeUrl(url, runtimeOrigin)) return;
      event.preventDefault();
      openExternalIfSafe(url);
    });
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      openExternalIfSafe(url);
      return { action: "deny" };
    });
    mainWindow.on("closed", () => {
      mainWindow = null;
    });
    return mainWindow.loadURL(runtimeOrigin);
  }

  async function chooseProjectFolder(event) {
    if (
      !mainWindow ||
      event?.sender !== mainWindow.webContents ||
      (event?.senderFrame && !event.senderFrame.isMainFrame) ||
      !isRuntimeUrl(event.sender.getURL(), runtimeOrigin)
    ) {
      throw new Error("The project chooser is only available from Platynum.");
    }
    const chosen = await dialog.showOpenDialog(mainWindow, {
      title: "Choose a project folder",
      properties: ["openDirectory", "dontAddToRecent"],
    });
    if (chosen.canceled || !chosen.filePaths?.[0]) return null;
    return runtimeModule.allowRuntimeProjectRoot(chosen.filePaths[0]);
  }

  function configureSession() {
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  }

  async function stopRuntime() {
    if (shutdown) return shutdown;
    shutdown = Promise.resolve()
      .then(() => runtimeModule?.stopPlatynumServer?.())
      .catch(() => undefined)
      .finally(() => {
        runtimeServer = null;
      });
    return shutdown;
  }

  async function start() {
    if (started) return;
    started = true;
    if (app.requestSingleInstanceLock && !app.requestSingleInstanceLock()) {
      app.quit();
      return;
    }
    await app.whenReady();
    configureSession();
    ipcMain.handle("platynum:choose-project", chooseProjectFolder);
    try {
      await startRuntime();
      await createWindow();
    } catch (error) {
      await stopRuntime();
      throw error;
    }
  }

  function focusMainWindow() {
    if (!mainWindow) return;
    if (mainWindow.isMinimized?.()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }

  function bindLifecycle() {
    app.on("second-instance", focusMainWindow);
    app.on("window-all-closed", () => app.quit());
    app.on("before-quit", (event) => {
      if (shutdown) return;
      event.preventDefault();
      void stopRuntime().finally(() => app.exit(0));
    });
  }

  bindLifecycle();
  return { start, stopRuntime, chooseProjectFolder, getRuntimeOrigin: () => runtimeOrigin };
}

module.exports = { createDesktopMain, findFreeLoopbackPort };
