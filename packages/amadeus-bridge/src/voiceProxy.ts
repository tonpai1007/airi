/**
 * VoiceProxy — streams audio between AIRI and AMADEUS Brain's /ws/voice endpoint.
 */

export interface AudioConfig {
  inputSampleRate: number
  inputChannelCount: number
  outputSampleRate: number
  outputChannelCount: number
  echoCancellation: boolean
  noiseSuppression: boolean
}

export const DEFAULT_AUDIO_CONFIG: AudioConfig = {
  inputSampleRate: 16000,
  inputChannelCount: 1,
  outputSampleRate: 24000,
  outputChannelCount: 1,
  echoCancellation: true,
  noiseSuppression: true,
}

export class VoiceProxy {
  private ws: WebSocket | null = null
  private audioContext: AudioContext | null = null
  private mediaStream: MediaStream | null = null
  private scriptProcessor: ScriptProcessorNode | null = null
  private analyser: AnalyserNode | null = null
  private reconnectAttempt = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private destroyFlag = false
  private onSpeakingCallback: ((speaking: boolean) => void) | null = null
  private audioChunks: ArrayBuffer[] = []
  private audioQueue: ArrayBuffer[] = []
  private isPlaying = false

  constructor(
    private readonly config: AudioConfig = DEFAULT_AUDIO_CONFIG,
    private readonly maxReconnectAttempts = 5,
  ) {}

  async connect() {
    try {
      this.audioContext = new AudioContext({ sampleRate: this.config.inputSampleRate })
      await this.audioContext.resume()

      this.ws = new WebSocket('ws://127.0.0.1:8000/ws/voice')
      this.ws.binaryType = 'arraybuffer'

      this.ws.onopen = () => {
        this.reconnectAttempt = 0
        this.startAudioCapture()
      }

      this.ws.onmessage = (event) => this.handleMessage(event)
      this.ws.onerror = () => this.handleError()
      this.ws.onclose = () => this.handleClose()
    } catch (e) {
      console.error('[VoiceProxy] Connection failed:', e)
      this.scheduleReconnect()
    }
  }

  disconnect() {
    this.destroyFlag = true
    this.clearTimers()
    this.stopAudioCapture()
    if (this.ws) {
      this.ws.onclose = null
      this.ws.close()
      this.ws = null
    }
    if (this.audioContext) {
      this.audioContext.close()
      this.audioContext = null
    }
  }

  setSpeakingCallback(cb: (speaking: boolean) => void) {
    this.onSpeakingCallback = cb
  }

  private async startAudioCapture() {
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: this.config.inputSampleRate,
          channelCount: this.config.inputChannelCount,
          echoCancellation: this.config.echoCancellation,
          noiseSuppression: this.config.noiseSuppression,
        },
      })

      const source = this.audioContext!.createMediaStreamSource(this.mediaStream)
      this.analyser = this.audioContext!.createAnalyser()
      this.analyser.fftSize = 2048

      // Process audio in 100ms chunks
      const bufferSize = this.config.inputSampleRate * 0.1 * this.config.inputChannelCount
      this.scriptProcessor = this.audioContext!.createScriptProcessor(bufferSize, this.config.inputChannelCount, 1)

      this.scriptProcessor.onaudioprocess = (e) => {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
        const inputData = e.inputBuffer.getChannelData(0)
        const float32 = new Float32Array(inputData)
        const int16 = this.float32ToInt16(float32)
        this.ws.send(int16.buffer)
      }

      source.connect(this.analyser)
      source.connect(this.scriptProcessor)
      this.scriptProcessor.connect(this.audioContext!.destination)
    } catch (e) {
      console.error('[VoiceProxy] Audio capture failed:', e)
    }
  }

  private stopAudioCapture() {
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop())
      this.mediaStream = null
    }
    if (this.scriptProcessor) {
      this.scriptProcessor.disconnect()
      this.scriptProcessor = null
    }
  }

  private handleMessage(event: MessageEvent) {
    if (event.data instanceof ArrayBuffer) {
      this.audioQueue.push(event.data)
      this.playNextChunk()
    }
  }

  private async playNextChunk() {
    if (this.isPlaying || this.audioQueue.length === 0) return
    this.isPlaying = true

    const chunk = this.audioQueue.shift()
    if (!chunk || !this.audioContext) return

    try {
      const audioBuffer = await this.audioContext.decodeAudioData(chunk.slice(0))
      const source = this.audioContext.createBufferSource()
      source.buffer = audioBuffer
      source.connect(this.audioContext.destination)

      this.onSpeakingCallback?.(true)
      source.onended = () => {
        this.isPlaying = false
        this.onSpeakingCallback?.(false)
        this.playNextChunk()
      }

      source.start()
    } catch (e) {
      console.error('[VoiceProxy] Audio playback failed:', e)
      this.isPlaying = false
    }
  }

  private handleError() {
    console.error('[VoiceProxy] WebSocket error')
  }

  private handleClose() {
    this.stopAudioCapture()
    if (!this.destroyFlag) {
      this.scheduleReconnect()
    }
  }

  private scheduleReconnect() {
    if (this.destroyFlag || this.reconnectAttempt >= this.maxReconnectAttempts) return
    if (this.reconnectTimer) return

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempt), 30000)
    this.reconnectAttempt++

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, delay)
  }

  private clearTimers() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  private float32ToInt16(float32: Float32Array): Int16Array {
    const int16 = new Int16Array(float32.length)
    for (let i = 0; i < float32.length; i++) {
      const s = Math.max(-1, Math.min(1, float32[i]))
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
    }
    return int16
  }
}
