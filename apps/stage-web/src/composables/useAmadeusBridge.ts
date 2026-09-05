/**
 * Vue composable for the AMADEUS Bridge.
 *
 * Provides reactive state and methods for connecting to AMADEUS Brain
 * from the AIRI frontend.
 */

import type {
  EmotionPayload,
  StageEventType,
  TtsPayload,
  ToolCallPayload,
} from '@proj-airi/amadeus-bridge'
import { AmadeusBridge } from '@proj-airi/amadeus-bridge'

import { onMounted, onUnmounted, ref, readonly } from 'vue'

export interface UseAmadeusBridgeReturn {
  // Connection state
  amadeusConnected: ReturnType<typeof ref<boolean>>
  amadeusReconnecting: ReturnType<typeof ref<boolean>>
  reconnectAttempt: ReturnType<typeof ref<number>>

  // Cognitive state
  currentEmotion: ReturnType<typeof ref<EmotionPayload>>
  isThinking: ReturnType<typeof ref<boolean>>
  isSpeaking: ReturnType<typeof ref<boolean>>
  currentThought: ReturnType<typeof ref<string>>
  pendingActions: ReturnType<typeof ref<ToolCallPayload[]>>

  // TTS state
  currentTts: ReturnType<typeof ref<TtsPayload | null>>

  // Methods
  sendMessage: (text: string) => Promise<void>
  connect: () => void
  disconnect: () => void
}

export function useAmadeusBridge(): UseAmadeusBridgeReturn {
  const bridge = AmadeusBridge.getInstance()

  // Reactive state
  const amadeusConnected = ref(false)
  const amadeusReconnecting = ref(false)
  const reconnectAttempt = ref(0)
  const currentEmotion = ref<EmotionPayload>({ valence: 0, arousal: 0.5, dominant_emotion: 'neutral' })
  const isThinking = ref(false)
  const isSpeaking = ref(false)
  const currentThought = ref('')
  const pendingActions = ref<ToolCallPayload[]>([])
  const currentTts = ref<TtsPayload | null>(null)

  // Subscriptions
  const subscriptions: Array<{ event: StageEventType; unsubscribe: () => void }> = []

  function subscribe<T extends StageEventType>(event: T, handler: (data: any) => void) {
    const unsub = bridge.on(event, handler)
    subscriptions.push({ event, unsubscribe: unsub })
    return unsub
  }

  // Wire up event handlers
  subscribe('connected', () => {
    amadeusConnected.value = true
    amadeusReconnecting.value = false
  })

  subscribe('disconnected', () => {
    amadeusConnected.value = false
  })

  subscribe('reconnecting', (data) => {
    amadeusReconnecting.value = true
    reconnectAttempt.value = data.attempt
  })

  subscribe('emotionUpdate', (emotion) => {
    currentEmotion.value = emotion
  })

  subscribe('thinking', (thinking) => {
    isThinking.value = thinking
  })

  subscribe('thought', (thought) => {
    currentThought.value = thought
  })

  subscribe('action', (action) => {
    pendingActions.value = [...pendingActions.value.slice(-9), action]
  })

  subscribe('speaking', (speaking) => {
    isSpeaking.value = speaking
  })

  subscribe('ttsStarted', (tts) => {
    currentTts.value = tts
  })

  subscribe('ttsEnded', () => {
    currentTts.value = null
  })

  subscribe('error', (error) => {
    console.warn('[AMADEUS Bridge]', error)
  })

  // Methods
  function sendMessage(text: string) {
    return bridge.sendMessage(text)
  }

  function connect() {
    bridge.connect()
  }

  function disconnect() {
    bridge.disconnect()
  }

  onMounted(() => {
    connect()
  })

  onUnmounted(() => {
    subscriptions.forEach(({ unsubscribe }) => unsubscribe())
    subscriptions.length = 0
    // Note: we don't call disconnect() here because the bridge is a singleton
    // that may be used by other components
  })

  return {
    amadeusConnected: readonly(amadeusConnected),
    amadeusReconnecting: readonly(amadeusReconnecting),
    reconnectAttempt: readonly(reconnectAttempt),
    currentEmotion: readonly(currentEmotion),
    isThinking: readonly(isThinking),
    isSpeaking: readonly(isSpeaking),
    currentThought: readonly(currentThought),
    pendingActions: readonly(pendingActions),
    currentTts: readonly(currentTts),
    sendMessage,
    connect,
    disconnect,
  }
}
