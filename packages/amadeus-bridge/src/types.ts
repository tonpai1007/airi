/**
 * Type definitions for the AMADEUS Bridge.
 */

/** Emotional state payload from Brain's emotion_engine. */
export interface EmotionPayload {
  valence: number
  arousal: number
  dominant_emotion?: string
}

/** Internal monologue payload from Brain's internal_monologue. */
export interface ThoughtPayload {
  thoughts: {
    logic: string
    intuition: string
    empathy: string
  }
}

/** Tool call payload from Brain's tool_call_resolver. */
export interface ToolCallPayload {
  tool: string
  status: string
  result_summary?: string
}

/** Chat response chunk from Brain's chat_pipeline. */
export interface ChatResponsePayload {
  text: string
  streaming?: boolean
  final?: boolean
}

/** Health alert payload from Brain's health_monitor. */
export interface HealthAlertPayload {
  component: string
  status: string
  message: string
}

/** Vault change payload from Brain's vault_watcher. */
export interface VaultChangePayload {
  file: string
  change_type: 'created' | 'modified' | 'deleted'
}

/** Proactive push payload from Brain's proactive_agent. */
export interface ProactivePushPayload {
  text: string
  priority: 'info' | 'warning' | 'alert'
  channel: string
}

/** TTS event payload from Brain's voice.tts_engine. */
export interface TtsPayload {
  text: string
  voice_id?: string
  duration_ms?: number
}

/** Committee deliberation payload from Brain's agent_committee. */
export interface CommitteePayload {
  query: string
  perspectives?: string[]
  synthesis?: string
  confidence?: number
}

/** Dream payload from Brain's memory_jobs.nightly_synthesis. */
export interface DreamPayload {
  insight: string
  themes?: string[]
}

/** Union type for all bus event payloads. */
export type BusEventPayload =
  | EmotionPayload
  | ThoughtPayload
  | ToolCallPayload
  | ChatResponsePayload
  | HealthAlertPayload
  | VaultChangePayload
  | ProactivePushPayload
  | TtsPayload
  | CommitteePayload
  | DreamPayload

/** Parsed bus event from WebSocket. */
export interface BusEvent {
  id: string
  topic: string
  source: string
  payload: BusEventPayload
  priority: string
  timestamp: number
}

/** Outgoing chat message to Brain. */
export interface ChatMessage {
  type: 'chat_message'
  text: string
  user_id: string
  platform: string
  session_id?: string
}

/** SSE chunk from Brain's /agent/chat/stream. */
export interface StreamChunk {
  response?: string
  done?: boolean
  error?: string
}

/** Bridge configuration. */
export interface BridgeConfig {
  brainUrl: string
  wsUrl: string
  chatUrl: string
  streamUrl: string
  userId: string
  platform: string
  apiKey?: string
  reconnectBaseDelay: number
  reconnectMaxDelay: number
  reconnectFactor: number
  pingInterval: number
  pongTimeout: number
  queueMaxSize: number
  featureVoice: boolean
  featureMemoryViz: boolean
  featureProactivePush: boolean
  featureCommitteeViz: boolean
}

export const DEFAULT_BRIDGE_CONFIG: BridgeConfig = {
  brainUrl: 'http://127.0.0.1:8000',
  wsUrl: 'ws://127.0.0.1:8000/ws/amadeus',
  chatUrl: 'http://127.0.0.1:8000/agent/chat',
  streamUrl: 'http://127.0.0.1:8000/agent/chat/stream',
  userId: 'owner',
  platform: 'airi',
  apiKey: undefined,
  reconnectBaseDelay: 1000,
  reconnectMaxDelay: 30000,
  reconnectFactor: 2,
  pingInterval: 15000,
  pongTimeout: 30000,
  queueMaxSize: 100,
  featureVoice: true,
  featureMemoryViz: true,
  featureProactivePush: true,
  featureCommitteeViz: true,
}

/** Stage events emitted by the bridge. */
export type StageEventType =
  | 'connected'
  | 'disconnected'
  | 'reconnecting'
  | 'emotionUpdate'
  | 'thinking'
  | 'thought'
  | 'action'
  | 'speaking'
  | 'responseChunk'
  | 'responseComplete'
  | 'dream'
  | 'healthAlert'
  | 'vaultChange'
  | 'proactivePush'
  | 'ttsStarted'
  | 'ttsEnded'
  | 'committeeStart'
  | 'committeeComplete'
  | 'error'

export interface StageEventMap {
  connected: { latency: number }
  disconnected: { reason: string }
  reconnecting: { attempt: number; delay: number }
  emotionUpdate: EmotionPayload
  thinking: boolean
  thought: string
  action: ToolCallPayload
  speaking: boolean
  responseChunk: { text: string }
  responseComplete: { text: string }
  dream: DreamPayload
  healthAlert: HealthAlertPayload
  vaultChange: VaultChangePayload
  proactivePush: ProactivePushPayload
  ttsStarted: TtsPayload
  ttsEnded: { duration_ms?: number }
  committeeStart: CommitteePayload
  committeeComplete: CommitteePayload
  error: {
    severity: 'warning' | 'error' | 'critical'
    code: string
    message: string
    recoverable: boolean
    retryAfter?: number
  }
}
