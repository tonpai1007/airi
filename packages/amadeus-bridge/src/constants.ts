/**
 * Default configuration and environment variable overrides for the AMADEUS Bridge.
 */

import type { BridgeConfig } from './types'

export function loadBridgeConfig(): BridgeConfig {
  const env = typeof globalThis !== 'undefined' ? (globalThis as any).process?.env : undefined

  const base = {
    brainUrl: env?.AMADEUS_BRAIN_URL ?? 'http://127.0.0.1:8000',
    wsUrl: env?.AMADEUS_WS_URL ?? 'ws://127.0.0.1:8000/ws/amadeus',
    chatUrl: env?.AMADEUS_CHAT_URL ?? 'http://127.0.0.1:8000/agent/chat',
    streamUrl: env?.AMADEUS_STREAM_URL ?? 'http://127.0.0.1:8000/agent/chat/stream',
    userId: env?.AMADEUS_USER_ID ?? 'owner',
    platform: env?.AMADEUS_PLATFORM ?? 'airi',
    apiKey: env?.AMADEUS_API_KEY,
    reconnectBaseDelay: Number(env?.AMADEUS_RECONNECT_BASE_DELAY ?? 1000),
    reconnectMaxDelay: Number(env?.AMADEUS_RECONNECT_MAX_DELAY ?? 30000),
    reconnectFactor: Number(env?.AMADEUS_RECONNECT_FACTOR ?? 2),
    pingInterval: Number(env?.AMADEUS_PING_INTERVAL ?? 15000),
    pongTimeout: Number(env?.AMADEUS_PONG_TIMEOUT ?? 30000),
    queueMaxSize: Number(env?.AMADEUS_QUEUE_MAX_SIZE ?? 100),
    featureVoice: env?.AMADEUS_FEATURE_VOICE !== 'false',
    featureMemoryViz: env?.AMADEUS_FEATURE_MEMORY_VIZ !== 'false',
    featureProactivePush: env?.AMADEUS_FEATURE_PROACTIVE_PUSH !== 'false',
    featureCommitteeViz: env?.AMADEUS_FEATURE_COMMITTEE_VIZ !== 'false',
  }

  return base
}
