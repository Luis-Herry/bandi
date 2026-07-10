const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("bandiDesktop", {
  getSettings: () => ipcRenderer.invoke("bandi:get-desktop-settings"),
  chooseDownloadDirectory: () =>
    ipcRenderer.invoke("bandi:choose-download-directory"),
  saveSettings: (input) =>
    ipcRenderer.invoke("bandi:save-desktop-settings", input),
});
