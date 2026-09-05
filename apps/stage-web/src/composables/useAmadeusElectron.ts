/**
 * useAmadeusElectron — native notification bridge for Electron desktop.
 *
 * Only active when running inside Electron with the AMADEUS bridge exposed.
 */

import { useAmadeusBridge } from '@proj-airi/stage-web/composables/useAmadeusBridge'

const BRIDGE_KEY = 'amadeus' as const

function getElectronAPI(): any | null {
  try {
    if (typeof globalThis !== 'undefined' && (globalThis as any).window?.electron) {
      return (globalThis as any).window
    }
    if (typeof globalThis !== 'undefined' && (globalThis as any).window?.api) {
      return (globalThis as any).window
    }
  }
  catch {
    return null
  }
  return null
}

export function useAmadeusElectron() {
  const bridge = useAmadeusBridge()
  const electron = getElectronAPI()

  function showNotification(title: string, body: string, priority: string = 'info') {
    if (!electron?.amadeus?.showNotification) {
      return Promise.resolve({ shown: false })
    }

    return electron.amadeus.showNotification({ title, body, priority })
  }

  function getAppStatus() {
    if (!electron?.amadeus?.getAppStatus) {
      return Promise.resolve(null)
    }

    return electron.amadeus.getAppStatus()
  }

  function isElectronAvailable() {
    return !!electron?.amadeus
  }

  return {
    showNotification,
    getAppStatus,
    isElectronAvailable,
  }
}
