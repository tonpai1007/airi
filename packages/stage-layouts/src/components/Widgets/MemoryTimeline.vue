<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useAmadeusBridge } from '@proj-airi/stage-web/composables/useAmadeusBridge'

const bridge = useAmadeusBridge()

const events = ref<Array<{ type: string; text: string; time: number }>>([])

bridge.on('thought', (text) => {
  events.value.unshift({ type: 'thought', text, time: Date.now() })
  if (events.value.length > 100) events.value.pop()
})

bridge.on('action', (action) => {
  events.value.unshift({ type: 'tool_call', text: `${action.tool}: ${action.status}`, time: Date.now() })
  if (events.value.length > 100) events.value.pop()
})

bridge.on('dream', (dream) => {
  events.value.unshift({ type: 'dream', text: dream.insight, time: Date.now() })
  if (events.value.length > 100) events.value.pop()
})

bridge.on('emotionUpdate', (emotion) => {
  events.value.unshift({
    type: 'emotion',
    text: `${emotion.dominant_emotion || 'neutral'} (v:${emotion.valence.toFixed(2)})`,
    time: Date.now(),
  })
  if (events.value.length > 100) events.value.pop()
})

const formatTime = (ts: number) => {
  const d = new Date(ts)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

const iconMap: Record<string, string> = {
  thought: '💭',
  tool_call: '🔧',
  dream: '✨',
  emotion: '😊',
}
</script>

<template>
  <div v-if="bridge.amadeusConnected" class="mt-2 rounded-lg bg-black/30 p-2 text-xs">
    <div class="text-white/50 font-mono mb-2">Memory Timeline</div>
    <div class="max-h-48 overflow-y-auto flex flex-col gap-1">
      <div v-if="!events.length" class="text-white/30 italic">No events yet</div>
      <div v-for="(evt, i) in events" :key="i" class="flex gap-1.5 items-start">
        <span class="text-white/30 shrink-0">{{ formatTime(evt.time) }}</span>
        <span class="shrink-0">{{ iconMap[evt.type] || '•' }}</span>
        <span :class="{
          'text-blue-400': evt.type === 'thought',
          'text-yellow-400': evt.type === 'tool_call',
          'text-purple-400': evt.type === 'dream',
          'text-green-400': evt.type === 'emotion',
        }">{{ evt.text }}</span>
      </div>
    </div>
  </div>
</template>
