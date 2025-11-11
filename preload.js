const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  pickVideo: () => ipcRenderer.invoke('pick-video'),
  pickAudios: () => ipcRenderer.invoke('pick-audios'),
  pickOutput: () => ipcRenderer.invoke('pick-output'),
  pickLogo: () => ipcRenderer.invoke('pick-logo'),
  mergeAndLoop: (payload) => ipcRenderer.invoke('merge-and-loop', payload),
  onFfmpegLog: (cb) => ipcRenderer.on('ffmpeg-log', (_e, line) => cb(line)),
  onProgress: (cb) => ipcRenderer.on('progress', (_e, data) => cb(data)),
  // License
  checkLicense: () => ipcRenderer.invoke('check-license'),
  getMachineId: () => ipcRenderer.invoke('get-machine-id'),
  activateLicense: (key) => ipcRenderer.invoke('activate-license', key),
});
