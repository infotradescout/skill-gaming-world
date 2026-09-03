const { contextBridge, ipcRenderer } = require("electron");

// Preview frames never receive this bridge. The renderer can request a native
// directory picker, but it cannot provide a path or invoke arbitrary Electron APIs.
if (process.isMainFrame) {
  contextBridge.exposeInMainWorld("platynumDesktop", {
    chooseProjectFolder: () => ipcRenderer.invoke("platynum:choose-project"),
  });
}
