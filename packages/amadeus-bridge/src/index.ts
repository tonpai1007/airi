/**
 * AMADEUS Bridge — connects Project AIRI frontend to AMADEUS Brain backend.
 *
 * Usage:
 *   const bridge = AmadeusBridge.getInstance(config)
 *   bridge.on('connected', () => ...)
 *   bridge.on('emotionUpdate', (payload) => ...)
 *   await bridge.sendMessage('Hello AMADEUS')
 */

import type {
  BridgeConfig,
  BusEvent,
  BusEventPayload,
  ChatMessage,
  EmotionPayload,
  StageEventMap,
  StageEventType,
  TtsPayload,
} from './types'
import { DEFAULT_BRIDGE_CONFIG, loadBridgeConfig } from './constants'
import { BusAdapter } from './busAdapter'

type EventCallback<T extends StageEventType> = (data: StageEventMap[T]) => void

// ---------------------------------------------------------------------------
// AmadeusBridge — singleton
// ---------------------------------------------------------------------------

export class AmadeusBridge {
  private static instance: AmadeusBridge | null = null

  private readonly config: BridgeConfig
  private ws: WebSocket | null = null
  private listeners = new Map<StageEventType, Set<EventCallback<any>>>()
  private messageQueue: ChatMessage[] = []
  private reconnectAttempt = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private pingTimer: ReturnType<typeof setInterval> | null = null
  private pongTimer: ReturnType<typeof setTimeout> | null = null
  private lastPong = 0
  private connected = false
  private destroyFlag = false

  // Throttlers for high-frequency events
  private busAdapter: BusAdapter

  private constructor(config?: BridgeConfig) {
    this.config = config ?? loadBridgeConfig()
    this.busAdapter = new BusAdapter((event, data) => this.emit(event, data))
  }

  static getInstance(config?: BridgeConfig): AmadeusBridge {
    if (!AmadeusBridge.instance) {
      AmadeusBridge.instance = new AmadeusBridge(config)
    }
    return AmadeusBridge.instance
  }

  static resetInstance() {
    AmadeusBridge.instance?.dispose()
    AmadeusBridge.instance = null
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  isConnected(): boolean {
    return this.connected
  }

  connect() {
    if (this.destroyFlag) return
    if (this.ws?.readyState === WebSocket.OPEN) return

    this.emit('reconnecting', {
      attempt: this.reconnectAttempt,
      delay: this.calculateBackoff(),
    })

    // Auto-discover API key from Brain if not configured
    if (!this.config.apiKey) {
      this.fetchApiKey()
    }

    try {
      this.ws = new WebSocket(this.config.wsUrl)
      this.ws.onopen = () => this.handleOpen()
      this.ws.onmessage = (event) => this.handleMessage(event)
      this.ws.onerror = (err) => this.handleError(err)
      this.ws.onclose = (event) => this.handleClose(event)
    } catch (e) {
      this.scheduleReconnect()
    }
  }

  private async fetchApiKey() {
    try {
      const response = await fetch('http://127.0.0.1:8000/bridge/handshake')
      if (response.ok) {
        const data = await response.json() as { apiKey?: string }
        if (data.apiKey) {
          this.config.apiKey = data.apiKey
        }
      }
    } catch {
      // Ignore handshake failures
    }
  }

  disconnect() {
    this.destroyFlag = true
    this.clearTimers()
    if (this.ws) {
      this.ws.onclose = null
      this.ws.close()
      this.ws = null
    }
    this.connected = false
  }

  dispose() {
    this.disconnect()
    this.listeners.clear()
    this.messageQueue = []
  }

  async sendMessage(text: string): Promise<void> {
    const msg: ChatMessage = {
      type: 'chat_message',
      text,
      user_id: this.config.userId,
      platform: this.config.platform,
    }

    if (this.connected) {
      await this.postChat(msg)
    } else {
      this.messageQueue.push(msg)
      if (this.messageQueue.length > this.config.queueMaxSize) {
        this.messageQueue.shift()
      }
    }
  }

  on<T extends StageEventType>(event: T, callback: EventCallback<T>) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(callback)
    return () => this.off(event, callback)
  }

  off<T extends StageEventType>(event: T, callback: EventCallback<T>) {
    this.listeners.get(event)?.delete(callback)
  }

  // ---------------------------------------------------------------------------
  // WebSocket handlers
  // ---------------------------------------------------------------------------

  private handleOpen() {
    this.connected = true
    this.reconnectAttempt = 0
    this.lastPong = Date.now()
    this.startPing()

    const latency = Date.now() - (this.ws?.timestamp ?? Date.now())
    this.emit('connected', { latency })

    this.flushMessageQueue()
  }

  private handleMessage(event: MessageEvent) {
    try {
      const data = JSON.parse(event.data)

      // Handle pong
      if (data.type === 'pong') {
        this.lastPong = Date.now()
        return
      }

      // Handle bus event
      if (data.type === 'bus_event' && data.event) {
        this.handleBusEvent(data.event as BusEvent)
      }
    } catch (e) {
      // Ignore unparseable messages
    }
  }

  private handleError(_err: Event) {
    this.emit('error', {
      severity: 'warning',
      code: 'WS_ERROR',
      message: 'WebSocket error occurred',
      recoverable: true,
    })
  }

  private handleClose(_event: CloseEvent) {
    this.connected = false
    this.stopPing()
    this.emit('disconnected', { reason: 'Connection closed' })
    this.scheduleReconnect()
  }

  // ---------------------------------------------------------------------------
  // Bus event handling
  // ---------------------------------------------------------------------------

  private handleBusEvent(event: BusEvent) {
    this.busAdapter.handleEvent(event)
  }

  // ---------------------------------------------------------------------------
  // HTTP chat
  // ---------------------------------------------------------------------------

  private async postChat(msg: ChatMessage): Promise<void> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`
    }

    try {
      const response = await fetch(this.config.chatUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(msg),
      })

      if (!response.ok) {
        throw new Error(`Chat HTTP ${response.status}`)
      }

      const data = (await response.json()) as { response?: string }
      if (data.response) {
        this.emit('responseComplete', { text: data.response })
      }
    } catch (e) {
      this.emit('error', {
        severity: 'error',
        code: 'CHAT_FAILED',
        message: e instanceof Error ? e.message : 'Chat request failed',
        recoverable: true,
        retryAfter: 5000,
      })
    }
  }

  // ---------------------------------------------------------------------------
  // Reconnection
  // ---------------------------------------------------------------------------

  private scheduleReconnect() {
    if (this.destroyFlag) return
    if (this.reconnectTimer) return

    const delay = this.calculateBackoff()
    this.emit('reconnecting', {
      attempt: this.reconnectAttempt,
      delay,
    })

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.reconnectAttempt++
      this.connect()
    }, delay)
  }

  private calculateBackoff(): number {
    const delay =
      this.config.reconnectBaseDelay *
      Math.pow(this.config.reconnectFactor, this.reconnectAttempt)
    return Math.min(delay, this.config.reconnectMaxDelay)
  }

  private async flushMessageQueue() {
    while (this.messageQueue.length > 0 && this.connected) {
      const msg = this.messageQueue.shift()
      if (msg) {
        await this.postChat(msg)
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Ping / Pong keepalive
  // ---------------------------------------------------------------------------

  private startPing() {
    this.stopPing()
    this.lastPong = Date.now()

    this.pingTimer = setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return
      }

      // Check pong timeout
      if (Date.now() - this.lastPong > this.config.pongTimeout) {
        this.ws.close()
        return
      }

      try {
        this.ws.send(JSON.stringify({ type: 'ping' }))
      } catch {
        // Ignore send errors
      }
    }, this.config.pingInterval)
  }

  private stopPing() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer)
      this.pingTimer = null
    }
    if (this.pongTimer) {
      clearTimeout(this.pongTimer)
      this.pongTimer = null
    }
  }

  private clearTimers() {
    this.stopPing()
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  // ---------------------------------------------------------------------------
  // Event emitter
  // ---------------------------------------------------------------------------

  private emit<T extends StageEventType>(event: T, data: StageEventMap[T]) {
    this.listeners.get(event)?.forEach((cb) => {
      try {
        cb(data)
      } catch {
        // Ignore listener errors
      }
    })
  }
}
