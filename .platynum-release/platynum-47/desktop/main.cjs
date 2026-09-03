const { app, BrowserWindow, dialog, ipcMain, session, shell } = require("electron");
const { createDesktopMain } = require("./desktop-core.cjs");

const desktop = createDesktopMain({
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  session,
  shell,
});

desktop.start().catch((error) => {
  console.error("Platynum-47 could not start.", error);
  dialog.showErrorBox(
    "Platynum-47 could not open",
    "Platynum could not start its local workspace. Restart the app; if it still will not open, download a fresh copy from your private Platynum page.",
  );
  app.exit(1);
});
