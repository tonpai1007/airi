<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useAmadeusBridge } from '@proj-airi/stage-web/composables/useAmadeusBridge'

const bridge = useAmadeusBridge()

const activeTab = ref<'health' | 'vault' | 'memory'>('health')

const healthAlerts = ref<Array<{ component: string; status: string; message: string; time: number }>>([])
const vaultChanges = ref<Array<{ file: string; change_type: string; time: number }>>([])
const memoryEvents = ref<Array<{ type: string; text: string; time: number }>>([])

const healthCount = computed(() => healthAlerts.value.length)
const vaultCount = computed(() => vaultChanges.value.length)
const memoryCount = computed(() => memoryEvents.value.length)

bridge.on('healthAlert', (alert) => {
  healthAlerts.value.unshift({ ...alert, time: Date.now() })
  if (healthAlerts.value.length > 50) healthAlerts.value.pop()
})

bridge.on('vaultChange', (change) => {
  vaultChanges.value.unshift({ ...change, time: Date.now() })
  if (vaultChanges.value.length > 50) vaultChanges.value.pop()
})

bridge.on('thought', (text) => {
  memoryEvents.value.unshift({ type: 'thought', text, time: Date.now() })
  if (memoryEvents.value.length > 50) memoryEvents.value.pop()
})

bridge.on('action', (action) => {
  memoryEvents.value.unshift({ type: 'tool_call', text: `${action.tool}: ${action.status}`, time: Date.now() })
})

bridge.on('dream', (dream) => {
  memoryEvents.value.unshift({ type: 'dream', text: dream.insight, time: Date.now() })
})

const formatTime = (ts: number) => {
  const d = new Date(ts)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <div v-if="bridge.amadeusConnected" class="mt-2 rounded-lg bg-black/30 p-2 text-xs">
    <div class="flex gap-1 mb-2 border-b border-white/10 pb-1">
      <button
        v-for="tab in ['health', 'vault', 'memory']"
        :key="tab"
        class="flex-1 rounded px-1 py-0.5 text-white/60 hover:bg-white/10"
        :class="{ 'bg-white/15 text-white': activeTab === tab }"
        @click="activeTab = tab as any"
      >
        {{ tab === 'health' ? `Health (${healthCount})` : tab === 'vault' ? `Vault (${vaultCount})` : `Memory (${memoryCount})` }}
      </button>
    </div>

    <div v-if="activeTab === 'health'" class="max-h-32 overflow-y-auto flex flex-col gap-1">
      <div v-if="!healthAlerts.length" class="text-white/30 italic">No health events</div>
      <div v-for="(alert, i) in healthAlerts" :key="i" class="flex gap-1.5">
        <span class="text-white/30">{{ formatTime(alert.time) }}</span>
        <span :class="{
          'text-red-400': alert.status === 'critical',
          'text-yellow-400': alert.status === 'warning',
          'text-green-400': alert.status === 'healthy',
        }">[{{ alert.component }}]</span>
        <span class="text-white/60">{{ alert.message }}</span>
      </div>
    </div>

    <div v-if="activeTab === 'vault'" class="max-h-32 overflow-y-auto flex flex-col gap-1">
      <div v-if="!vaultChanges.length" class="text-white/30 italic">No vault activity</div>
      <div v-for="(change, i) in vaultChanges" :key="i" class="flex gap-1.5">
        <span class="text-white/30">{{ formatTime(change.time) }}</span>
        <span :class="{
          'text-green-400': change.change_type === 'created',
          'text-yellow-400': change.change_type === 'modified',
          'text-red-400': change.change_type === 'deleted',
        }">[{{ change.change_type }}]</span>
        <span class="text-white/60">{{ change.file }}</span>
      </div>
    </div>

    <div v-if="activeTab === 'memory'" class="max-h-32 overflow-y-auto flex flex-col gap-1">
      <div v-if="!memoryEvents.length" class="text-white/30 italic">No memory events</div>
      <div v-for="(evt, i) in memoryEvents" :key="i" class="flex gap-1.5">
        <span class="text-white/30">{{ formatTime(evt.time) }}</span>
        <span :class="{
          'text-blue-400': evt.type === 'thought',
          'text-yellow-400': evt.type === 'tool_call',
          'text-purple-400': evt.type === 'dream',
        }">[{{ evt.type }}]</span>
        <span class="text-white/60">{{ evt.text }}</span>
      </div>
    </div>
  </div>
</template>
