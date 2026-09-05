/**
 * AMADEUS Electron IPC bridge — native notifications from Brain bus events.
 *
 * Main-process side: registers IPC handlers and shows Electron notifications.
 */

import { ipcMain, Notification, app } from 'electron'
import { createContext } from '@moeru/eventa/adapters/electron/main'

export function setupAmadeusBridge() {
  const context = createContext(ipcMain)

  context.defineInvokeHandler('amadeus:show-notification', (payload) => {
    if (!Notification.isSupported()) {
      return { shown: false }
    }

    const notification = new Notification({
      title: payload.title || 'AMADEUS',
      body: payload.body || '',
      silent: payload.priority !== 'alert',
    })

    notification.on('click', () => {
      if (payload.onClick) {
        ipcMain.emit('amadeus:notification-clicked', payload.onClick)
      }
    })

    notification.show()
    return { shown: true }
  })

  context.defineInvokeHandler('amadeus:get-app-status', () => {
    return {
      isOnline: true,
      platform: process.platform,
      version: app.getVersion(),
    }
  })
}
