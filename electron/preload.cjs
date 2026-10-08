const { contextBridge, ipcRenderer, webUtils } = require('electron');
contextBridge.exposeInMainWorld('desktop', { config: () => ipcRenderer.invoke('config'), openVideo: () => ipcRenderer.invoke('open-video'), saveVideo: () => ipcRenderer.invoke('save-video'), filePath: file => webUtils.getPathForFile(file) });
