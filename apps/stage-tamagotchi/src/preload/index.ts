import { expose, type AmadeusElectronAPI } from './shared'

expose()

if (typeof globalThis !== 'undefined' && (globalThis as any).window?.electron) {
  const { contextBridge } = require('electron')
  try {
    contextBridge.exposeInMainWorld('amadeus', {
      showNotification: (payload: any) => (globalThis as any).window.electron.ipcRenderer.invoke('amadeus:show-notification', payload),
      getAppStatus: () => (globalThis as any).window.electron.ipcRenderer.invoke('amadeus:get-app-status'),
    } satisfies AmadeusElectronAPI)
  }
  catch {
    // ignore
  }
}
