const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("bandiDesktop", {
  getSettings: () => ipcRenderer.invoke("bandi:get-desktop-settings"),
  chooseDownloadDirectory: () =>
    ipcRenderer.invoke("bandi:choose-download-directory"),
  saveSettings: (input) =>
    ipcRenderer.invoke("bandi:save-desktop-settings", input),
  getWindowState: () => ipcRenderer.invoke("bandi:get-window-state"),
  minimizeWindow: () => ipcRenderer.invoke("bandi:minimize-window"),
  toggleMaximizeWindow: () =>
    ipcRenderer.invoke("bandi:toggle-maximize-window"),
  closeWindow: () => ipcRenderer.invoke("bandi:close-window"),
  onWindowStateChange: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("bandi:window-state-changed", listener);
    return () => ipcRenderer.removeListener("bandi:window-state-changed", listener);
  },
});
