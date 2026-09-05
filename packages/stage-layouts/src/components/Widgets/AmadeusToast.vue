<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useAmadeusBridge } from '@proj-airi/stage-web/composables/useAmadeusBridge'
import { useAmadeusElectron } from '@proj-airi/stage-web/composables/useAmadeusElectron'

const bridge = useAmadeusBridge()
const electron = useAmadeusElectron()

const toasts = ref<Array<{ id: number; text: string; priority: string; time: number }>>([])
let nextId = 0

bridge.on('proactivePush', (push) => {
  const id = nextId++
  toasts.value.push({ ...push, id, time: Date.now() })
  if (toasts.value.length > 3) {
    toasts.value.shift()
  }

  const duration = push.priority === 'alert' ? 15000 : push.priority === 'warning' ? 10000 : 6000
  setTimeout(() => {
    const idx = toasts.value.findIndex(t => t.id === id)
    if (idx >= 0) toasts.value.splice(idx, 1)
  }, duration)

  if (push.priority === 'alert' && electron.isElectronAvailable()) {
    electron.showNotification('AMADEUS Alert', push.text, push.priority)
  }
})

function dismiss(id: number) {
  const idx = toasts.value.findIndex(t => t.id === id)
  if (idx >= 0) toasts.value.splice(idx, 1)
}
</script>

<template>
  <div class="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
    <TransitionGroup name="toast">
      <div v-for="toast in toasts" :key="toast.id"
        class="flex items-start gap-2 rounded-lg p-3 shadow-lg backdrop-blur-sm"
        :class="{
          'bg-blue-500/90': toast.priority === 'info',
          'bg-yellow-500/90': toast.priority === 'warning',
          'bg-red-500/90': toast.priority === 'alert',
        }"
      >
        <div class="flex-1">
          <div class="text-xs font-semibold text-white/90">{{ toast.priority.toUpperCase() }}</div>
          <div class="text-sm text-white mt-0.5">{{ toast.text }}</div>
        </div>
        <button class="text-white/60 hover:text-white" @click="dismiss(toast.id)">✕</button>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s ease;
}
.toast-enter-from {
  opacity: 0;
  transform: translateX(100%);
}
.toast-leave-to {
  opacity: 0;
  transform: translateX(100%);
}
</style>
