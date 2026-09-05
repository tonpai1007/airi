<script setup lang="ts">
import { computed } from 'vue'
import { useAmadeusBridge } from '@proj-airi/stage-web/composables/useAmadeusBridge'

const { amadeusConnected, amadeusReconnecting, reconnectAttempt } = useAmadeusBridge()

const statusLabel = computed(() => {
  if (amadeusConnected.value) return 'AMADEUS Online'
  if (amadeusReconnecting.value) return `Reconnecting... (attempt ${reconnectAttempt.value})`
  return 'AMADEUS Offline'
})

const statusColor = computed(() => {
  if (amadeusConnected.value) return 'green'
  if (amadeusReconnecting.value) return 'yellow'
  return 'red'
})
</script>

<template>
  <div class="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/30 backdrop-blur-sm">
    <div
      class="h-2.5 w-2.5 rounded-full"
      :class="{
        'bg-green-500': statusColor === 'green',
        'bg-yellow-500 animate-pulse': statusColor === 'yellow',
        'bg-red-500': statusColor === 'red',
      }"
    />
    <span class="text-xs text-white/70 font-mono">{{ statusLabel }}</span>
  </div>
</template>
