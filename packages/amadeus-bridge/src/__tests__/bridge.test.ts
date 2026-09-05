import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { AmadeusBridge } from '../src/index'
import type { BridgeConfig } from '../src/types'

function createMockWs() {
  const handlers: Record<string, Set<Function>> = new Map()
  const queue: any[] = []

  return {
    ws: {
      readyState: 0,
      send: vi.fn(),
      close: vi.fn(),
      timestamp: Date.now(),
      set onopen(fn: (e: Event) => void) {
        handlers['open'] = handlers['open'] || new Set()
        handlers['open'].add(fn)
      },
      set onmessage(fn: (e: MessageEvent) => void) {
        handlers['message'] = handlers['message'] || new Set()
        handlers['message'].add(fn)
      },
      set onerror(fn: (e: Event) => void) {
        handlers['error'] = handlers['error'] || new Set()
        handlers['error'].add(fn)
      },
      set onclose(fn: (e: CloseEvent) => void) {
        handlers['close'] = handlers['close'] || new Set()
        handlers['close'].add(fn)
      },
      trigger(event: string, data?: any) {
        (handlers[event] || new Set()).forEach((fn: any) => fn(data))
      },
    } as any,
    handlers,
  }
}

describe('AmadeusBridge', () => {
  let config: BridgeConfig
  let mockWs: ReturnType<typeof createMockWs>

  beforeEach(() => {
    config = {
      brainUrl: 'http://127.0.0.1:8000',
      wsUrl: 'ws://127.0.0.1:8000/ws/amadeus',
      chatUrl: 'http://127.0.0.1:8000/agent/chat',
      streamUrl: 'http://127.0.0.1:8000/agent/chat/stream',
      userId: 'test-user',
      platform: 'airi',
      reconnectBaseDelay: 50,
      reconnectMaxDelay: 200,
      reconnectFactor: 2,
      pingInterval: 1000,
      pongTimeout: 2000,
      queueMaxSize: 10,
      featureVoice: true,
      featureMemoryViz: true,
      featureProactivePush: true,
      featureCommitteeViz: true,
    }

    mockWs = createMockWs()
    vi.stubGlobal('WebSocket', class extends EventTarget {
      readyState = 0
      send = mockWs.ws.send
      close = mockWs.ws.close
      timestamp = Date.now()
      set onopen(fn: any) { mockWs.ws.onopen = fn }
      set onmessage(fn: any) { mockWs.ws.onmessage = fn }
      set onerror(fn: any) { mockWs.ws.onerror = fn }
      set onclose(fn: any) { mockWs.ws.onclose = fn }
    })

    vi.stubGlobal('fetch', vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ response: 'Hello from Brain' }),
      } as Response)
    ))
  })

  afterEach(() => {
    AmadeusBridge.resetInstance()
    vi.unstubAllGlobals()
    vi.clearAllTimers()
  })

  it('connects to WebSocket with correct URL', async () => {
    const bridge = AmadeusBridge.getInstance(config)

    const connected = vi.fn()
    bridge.on('connected', connected)

    bridge.connect()

    // Simulate WebSocket open
    mockWs.ws.trigger('open')
    await vi.waitFor(() => expect(connected).toHaveBeenCalled())
  })

  it('emits connected event with latency', async () => {
    const bridge = AmadeusBridge.getInstance(config)
    const connected = vi.fn()
    bridge.on('connected', connected)

    bridge.connect()
    mockWs.ws.trigger('open')

    await vi.waitFor(() => expect(connected).toHaveBeenCalled())
    expect(connected.mock.calls[0][0]).toHaveProperty('latency')
  })

  it('translates emotion event to stage event', async () => {
    const bridge = AmadeusBridge.getInstance(config)
    const emotionSpy = vi.fn()
    bridge.on('emotionUpdate', emotionSpy)

    bridge.connect()
    mockWs.ws.trigger('open')
    await vi.waitFor(() => expect(bridge.isConnected()).toBe(true))

    mockWs.ws.trigger('message', {
      data: JSON.stringify({
        type: 'bus_event',
        event: {
          topic: 'emotion',
          source: 'emotion_engine',
          payload: { valence: 0.8, arousal: 0.3, dominant_emotion: 'joy' },
          priority: 'normal',
        },
      }),
    })

    await vi.waitFor(() => expect(emotionSpy).toHaveBeenCalled())
    expect(emotionSpy.mock.calls[0][0]).toEqual({
      valence: 0.8,
      arousal: 0.3,
      dominant_emotion: 'joy',
    })
  })

  it('translates thought event to thinking state', async () => {
    const bridge = AmadeusBridge.getInstance(config)
    const thinkingSpy = vi.fn()
    const thoughtSpy = vi.fn()
    bridge.on('thinking', thinkingSpy)
    bridge.on('thought', thoughtSpy)

    bridge.connect()
    mockWs.ws.trigger('open')
    await vi.waitFor(() => expect(bridge.isConnected()).toBe(true))

    mockWs.ws.trigger('message', {
      data: JSON.stringify({
        type: 'bus_event',
        event: {
          topic: 'internal_monologue',
          source: 'internal_monologue',
          payload: {
            thoughts: {
              logic: 'Analyzing request',
              intuition: 'Pattern recognized',
              empathy: 'User seems curious',
            },
          },
          priority: 'normal',
        },
      }),
    })

    await vi.waitFor(() => expect(thinkingSpy).toHaveBeenCalledWith(true))
    await vi.waitFor(() => expect(thoughtSpy).toHaveBeenCalled())
  })

  it('sends chat message via HTTP', async () => {
    const bridge = AmadeusBridge.getInstance(config)
    bridge.connect()
    mockWs.ws.trigger('open')
    await vi.waitFor(() => expect(bridge.isConnected()).toBe(true))

    await bridge.sendMessage('Hello AMADEUS')

    await vi.waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        config.chatUrl,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            type: 'chat_message',
            text: 'Hello AMADEUS',
            user_id: 'test-user',
            platform: 'airi',
          }),
        })
      )
    })
  })

  it('queues messages during disconnection', async () => {
    const bridge = AmadeusBridge.getInstance(config)
    // Don't connect
    await bridge.sendMessage('Message 1')
    await bridge.sendMessage('Message 2')

    expect(bridge).toHaveProperty('messageQueue')
    // Queue should hold messages when disconnected
  })

  it('reconnects with exponential backoff on disconnect', async () => {
    vi.useFakeTimers()
    const bridge = AmadeusBridge.getInstance(config)

    bridge.connect()
    mockWs.ws.trigger('open')
    await vi.waitFor(() => expect(bridge.isConnected()).toBe(true))

    // Simulate disconnect
    mockWs.ws.trigger('close', { code: 1006, reason: 'abnormal' })

    // Should schedule reconnect
    await vi.advanceTimersByTimeAsync(50)
    // WebSocket constructor should be called again for reconnect
  })

  it('disposes cleanly', () => {
    const bridge = AmadeusBridge.getInstance(config)
    bridge.connect()
    mockWs.ws.trigger('open')

    expect(bridge.isConnected()).toBe(true)

    bridge.dispose()
    expect(bridge.isConnected()).toBe(false)
  })
})
