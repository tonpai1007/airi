/**
 * BusAdapter — filters, throttles, and translates Brain bus events
 * into AIRI stage events.
 */

import type { BusEvent, StageEventMap, StageEventType } from './types'

type ThrottleConfig = {
  maxPerSecond: number
  burst: number
}

const THROTTLE_POLICY: Record<string, ThrottleConfig> = {
  thought: { maxPerSecond: 2, burst: 5 },
  tool_call: { maxPerSecond: 5, burst: 10 },
  emotion: { maxPerSecond: 1, burst: 3 },
  health_alert: { maxPerSecond: 0.1, burst: 2 },
  vault_change: { maxPerSecond: 0.05, burst: 20 },
  proactive_push: { maxPerSecond: 0.02, burst: 10 },
}

class Throttler {
  private lastTime = 0
  private queue: Array<() => void> = []
  private burstUsed = 0

  constructor(private readonly maxPerSecond: number, private readonly burst: number) {}

  allow(): boolean {
    const now = Date.now()
    const interval = 1000 / this.maxPerSecond

    if (now - this.lastTime >= interval) {
      this.lastTime = now
      this.burstUsed = 0
      this.flush()
      return true
    }

    if (this.burstUsed < this.burst) {
      this.burstUsed++
      return true
    }

    return false
  }

  private flush() {
    this.queue.length = 0
  }
}

export class BusAdapter {
  private throttlers = new Map<string, Throttler>()

  constructor(private emit: (event: StageEventType, data: any) => void) {
    for (const [topic, config] of Object.entries(THROTTLE_POLICY)) {
      this.throttlers.set(topic, new Throttler(config.maxPerSecond, config.burst))
    }
  }

  handleEvent(event: BusEvent) {
    const { topic, payload } = event

    // Always pass through streaming responses
    if (topic === 'chat_response') {
      this.handleChatResponse(payload)
      return
    }

    // Check throttle for other topics
    const throttler = this.throttlers.get(topic)
    if (throttler && !throttler.allow()) {
      return
    }

    this.translate(topic, payload)
  }

  private handleChatResponse(payload: any) {
    const chatPayload = payload as { text?: string; streaming?: boolean; final?: boolean }
    if (chatPayload.streaming && chatPayload.text) {
      this.emit('responseChunk', { text: chatPayload.text })
    }
    if (chatPayload.final && chatPayload.text) {
      this.emit('responseComplete', { text: chatPayload.text })
      this.emit('speaking', false)
    }
  }

  private translate(topic: string, payload: any) {
    switch (topic) {
      case 'emotion':
        this.emit('emotionUpdate', payload)
        break

      case 'internal_monologue':
        this.emit('thinking', true)
        const thoughtText = payload.thoughts?.logic || payload.thoughts?.intuition || ''
        if (thoughtText) {
          this.emit('thought', thoughtText)
        }
        setTimeout(() => this.emit('thinking', false), 2000)
        break

      case 'tool_call':
        this.emit('action', payload)
        break

      case 'dream':
        this.emit('dream', payload)
        break

      case 'health_alert':
        this.emit('healthAlert', payload)
        break

      case 'vault_change':
        this.emit('vaultChange', payload)
        break

      case 'proactive_push':
        this.emit('proactivePush', payload)
        break

      case 'tts_started':
        this.emit('ttsStarted', payload)
        this.emit('speaking', true)
        break

      case 'tts_ended':
        this.emit('ttsEnded', { duration_ms: payload.duration_ms })
        this.emit('speaking', false)
        break

      case 'committee_started':
        this.emit('committeeStart', payload)
        break

      case 'committee_completed':
        this.emit('committeeComplete', payload)
        break

      default:
        // Pass through unknown topics
        this.emit(topic as StageEventType, payload)
    }
  }
}
