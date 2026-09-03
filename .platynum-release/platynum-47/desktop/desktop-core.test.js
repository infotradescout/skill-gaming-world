import { afterEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const { bundledCodexPath, bundledNpmCliPath, desktopRuntimeEnvironment, localOrigin, runtimeNodeDirectory } = require("./config.cjs");
const { createDesktopMain } = require("./desktop-core.cjs");

const runtimeEnvKeys = ["P47_LOCAL_RUNTIME", "P47_DESKTOP_RUNTIME", "PORT", "P47_CODEX_BIN", "P47_NPM_CLI", "P47_NODE_BIN", "P47_RUNTIME_NODE_DIR", "CODEX_HOME", "P47_RUNTIME_RECORD_DIR", "P47_PROJECT_ROOTS"];
const priorEnv = new Map(runtimeEnvKeys.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const [key, value] of priorEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("Windows desktop shell", () => {
  it("resolves an unpacked Windows worker and keeps desktop data per user", () => {
    const paths = {
      appPath: "C:\\Program Files\\Platynum-47\\resources\\app.asar",
      resourcesPath: "C:\\Program Files\\Platynum-47\\resources",
      isPackaged: true,
    };
    const executable = bundledCodexPath(paths);
    expect(executable).toContain("app.asar.unpacked");
    expect(executable).toContain("codex-win32-x64");
    expect(executable).toMatch(/codex\.exe$/);
    expect(bundledNpmCliPath(paths)).toContain("project-runner");
    expect(bundledNpmCliPath(paths)).toMatch(/npm-cli\.js$/);
    expect(runtimeNodeDirectory(paths)).toContain("project-runner");
    const environment = desktopRuntimeEnvironment({ ...paths, port: 51234, nodeBin: "C:\\Program Files\\Platynum-47\\Platynum-47.exe", codexHome: "C:\\Users\\Thomas\\AppData\\Roaming\\Platynum-47\\codex", projectRoots: ["C:\\Users\\Thomas\\Documents"] });
    expect(environment.P47_LOCAL_RUNTIME).toBe("1");
    expect(environment.P47_DESKTOP_RUNTIME).toBe("1");
    expect(environment.P47_NPM_CLI).toMatch(/npm-cli\.js$/);
    expect(environment.P47_NODE_BIN).toMatch(/Platynum-47\.exe$/);
    expect(localOrigin(51234)).toBe("http://127.0.0.1:51234");
    expect(() => localOrigin(0)).toThrow();
  });

  it("starts one locked-down window and accepts folders only through the native picker", async () => {
    const events = new Map();
    const server = { address: () => ({ port: 51234 }) };
    const serverModule = {
      startPlatynumServer: vi.fn(async () => server),
      stopPlatynumServer: vi.fn(async () => undefined),
      allowRuntimeProjectRoot: vi.fn(async (root) => ({ id: "alpha", name: "alpha", root, kind: "git", branch: "main", dirty: false, changedFiles: 0, scripts: [] })),
    };
    const shell = { openExternal: vi.fn(async () => undefined) };
    const dialog = { showOpenDialog: vi.fn(async () => ({ canceled: false, filePaths: ["C:\\Work\\alpha"] })) };
    const ipcMain = { handle: vi.fn() };
    const session = { defaultSession: { setPermissionRequestHandler: vi.fn() } };
    const app = {
      isPackaged: true,
      requestSingleInstanceLock: vi.fn(() => true),
      whenReady: vi.fn(async () => undefined),
      getAppPath: () => "C:\\Program Files\\Platynum-47\\resources\\app.asar",
      getPath: (name) => ({
        home: "C:\\Users\\Thomas",
        documents: "C:\\Users\\Thomas\\Documents",
        desktop: "C:\\Users\\Thomas\\Desktop",
        userData: "C:\\Users\\Thomas\\AppData\\Roaming\\Platynum-47",
      })[name],
      on: vi.fn((name, callback) => events.set(name, callback)),
      quit: vi.fn(),
      exit: vi.fn(),
    };
    let windowInstance;
    class FakeWindow {
      constructor(options) {
        this.options = options;
        this.show = vi.fn();
        this.focus = vi.fn();
        this.restore = vi.fn();
        this.isMinimized = vi.fn(() => false);
        this.once = vi.fn((name, callback) => { if (name === "ready-to-show") callback(); });
        this.on = vi.fn();
        this.loadURL = vi.fn(async (url) => { this.url = url; });
        this.webContents = {
          on: vi.fn((name, callback) => { this[`${name}Handler`] = callback; }),
          setWindowOpenHandler: vi.fn((callback) => { this.openHandler = callback; }),
          getURL: () => this.url || "",
        };
        windowInstance = this;
      }
    }

    const desktop = createDesktopMain({
      app,
      BrowserWindow: FakeWindow,
      dialog,
      ipcMain,
      session,
      shell,
      findFreePort: async () => 51234,
      loadServer: async () => serverModule,
      pathApi: path.win32,
    });
    await desktop.start();

    expect(serverModule.startPlatynumServer).toHaveBeenCalledWith({ port: 51234, host: "127.0.0.1" });
    expect(windowInstance.loadURL).toHaveBeenCalledWith("http://127.0.0.1:51234");
    expect(windowInstance.options.webPreferences).toMatchObject({
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      webviewTag: false,
    });
    const permissionHandler = session.defaultSession.setPermissionRequestHandler.mock.calls[0][0];
    const permission = vi.fn();
    permissionHandler({}, "notifications", permission);
    expect(permission).toHaveBeenCalledWith(false);

    const localNavigation = { preventDefault: vi.fn() };
    windowInstance["will-navigateHandler"](localNavigation, "http://127.0.0.1:51234/projects");
    expect(localNavigation.preventDefault).not.toHaveBeenCalled();
    const blockedNavigation = { preventDefault: vi.fn() };
    windowInstance["will-navigateHandler"](blockedNavigation, "file:///C:/temp/untrusted.html");
    expect(blockedNavigation.preventDefault).toHaveBeenCalledOnce();
    expect(shell.openExternal).not.toHaveBeenCalled();
    expect(windowInstance.openHandler({ url: "https://chatgpt.com" })).toEqual({ action: "deny" });
    expect(shell.openExternal).toHaveBeenCalledWith("https://chatgpt.com");

    const chooser = ipcMain.handle.mock.calls.find(([name]) => name === "platynum:choose-project")[1];
    const project = await chooser({ sender: windowInstance.webContents }, "C:\\attacker-supplied-path");
    expect(dialog.showOpenDialog).toHaveBeenCalledOnce();
    expect(serverModule.allowRuntimeProjectRoot).toHaveBeenCalledWith("C:\\Work\\alpha");
    expect(project.root).toBe("C:\\Work\\alpha");
    await expect(chooser({ sender: windowInstance.webContents, senderFrame: { isMainFrame: false } })).rejects.toThrow("only available from Platynum");
    await expect(chooser({ sender: { getURL: () => "http://127.0.0.1:51234" } })).rejects.toThrow("only available from Platynum");

    await desktop.stopRuntime();
    expect(serverModule.stopPlatynumServer).toHaveBeenCalledOnce();
    expect(events.has("before-quit")).toBe(true);
  });
});
