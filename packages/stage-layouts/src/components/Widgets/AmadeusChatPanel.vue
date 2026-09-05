<script setup lang="ts">
import { ref, watch } from 'vue'
import { useAmadeusBridge } from '@proj-airi/stage-web/composables/useAmadeusBridge'

const bridge = useAmadeusBridge()

const messages = ref<Array<{ role: 'user' | 'assistant'; text: string }>>([])
const input = ref('')
const sending = ref(false)

function appendMessage(role: 'user' | 'assistant', text: string) {
  messages.value.push({ role, text })
}

watch(() => bridge.isThinking, (thinking) => {
  if (thinking) {
    appendMessage('assistant', 'Thinking...')
  }
})

watch(() => bridge.isSpeaking, (speaking) => {
  if (!speaking && messages.value[messages.value.length - 1]?.text === 'Thinking...') {
    messages.value.pop()
  }
})

bridge.on('responseComplete', ({ text }) => {
  if (messages.value[messages.value.length - 1]?.text === 'Thinking...') {
    messages.value.pop()
  }
  appendMessage('assistant', text)
})

bridge.on('error', (err) => {
  appendMessage('assistant', `[Error: ${err.message}]`)
})

async function send() {
  const text = input.value.trim()
  if (!text || sending.value) return

  input.value = ''
  sending.value = true
  appendMessage('user', text)

  try {
    await bridge.sendMessage(text)
  }
  catch {
    appendMessage('assistant', '[Failed to send]')
  }
  finally {
    sending.value = false
  }
}
</script>

<template>
  <div v-if="bridge.amadeusConnected" class="mt-2 flex flex-col gap-2 rounded-lg bg-black/20 p-3">
    <div class="text-xs text-white/50 font-mono mb-1">
      AMADEUS Brain Chat
      <span v-if="bridge.isThinking" class="ml-2 text-yellow-400">thinking...</span>
      <span v-if="bridge.isSpeaking" class="ml-2 text-green-400">speaking</span>
    </div>

    <div class="max-h-40 overflow-y-auto flex flex-col gap-1.5">
      <div v-for="(msg, i) in messages" :key="i" class="text-sm"
        :class="msg.role === 'user' ? 'text-right text-white/80' : 'text-left text-white/60'">
        <span class="inline-block rounded px-2 py-1 max-w-[85%]"
          :class="msg.role === 'user' ? 'bg-primary-500/30' : 'bg-white/5'">
          {{ msg.text }}
        </span>
      </div>
    </div>

    <div class="flex gap-2 mt-1">
      <input v-model="input" :disabled="sending" class="flex-1 rounded bg-white/5 px-2 py-1 text-xs text-white"
        placeholder="Message AMADEUS..." @keydown.enter.prevent="send" />
      <button :disabled="sending || !input.trim()"
        class="rounded bg-primary-500/80 px-3 py-1 text-xs text-white disabled:opacity-50"
        @click="send">
        Send
      </button>
    </div>
  </div>
</template>
