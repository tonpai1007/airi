<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useAmadeusBridge } from '@proj-airi/stage-web/composables/useAmadeusBridge'

const bridge = useAmadeusBridge()

const active = ref(false)
const query = ref('')
const perspectives = ref<string[]>([])
const synthesis = ref('')
const confidence = ref(0)
const phase = ref<'idle' | 'deliberating' | 'complete'>('idle')

bridge.on('committeeStart', (data) => {
  query.value = data.query || ''
  perspectives.value = data.perspectives || ['Logic', 'Strategy', 'Empathy', 'Skeptic']
  synthesis.value = ''
  confidence.value = 0
  phase.value = 'deliberating'
  active.value = true
})

bridge.on('committeeComplete', (data) => {
  synthesis.value = data.synthesis || ''
  confidence.value = data.confidence || 0
  phase.value = 'complete'
  setTimeout(() => {
    active.value = false
    setTimeout(() => {
      phase.value = 'idle'
      synthesis.value = ''
      confidence.value = 0
    }, 300)
  }, 4000)
})

const orbColors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444']

function dismiss() {
  active.value = false
  setTimeout(() => {
    phase.value = 'idle'
    synthesis.value = ''
    confidence.value = 0
  }, 300)
}
</script>

<template>
  <Transition name="committee">
    <div v-if="active" class="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      @click.self="dismiss">
      <div class="relative w-80 h-80">
        <div class="absolute inset-0 flex items-center justify-center">
          <div class="text-center">
            <div class="text-lg font-bold text-white mb-1">Committee Deliberation</div>
            <div class="text-xs text-white/60 max-w-[200px] mx-auto">{{ query }}</div>
          </div>
        </div>

        <div v-for="(perspective, i) in perspectives" :key="perspective"
          class="absolute w-16 h-16 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-lg"
          :style="{
            background: orbColors[i % orbColors.length],
            top: `${20 + 30 * Math.cos((i / perspectives.length) * 2 * Math.PI)}%`,
            left: `${50 + 35 * Math.sin((i / perspectives.length) * 2 * Math.PI)}%`,
            transform: 'translate(-50%, -50%)',
            animation: `pulse 1.5s ease-in-out ${i * 0.2}s infinite`,
          }">
          {{ perspective }}
        </div>

        <div v-if="phase === 'complete'" class="absolute inset-0 flex items-center justify-center">
          <div class="bg-black/80 rounded-xl p-4 max-w-[250px]">
            <div class="text-xs text-white/60 mb-1">Synthesis</div>
            <div class="text-sm text-white mb-2">{{ synthesis }}</div>
            <div class="text-xs text-white/40">Confidence: {{ Math.round(confidence * 100) }}%</div>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.committee-enter-active,
.committee-leave-active {
  transition: all 0.3s ease;
}
.committee-enter-from,
.committee-leave-to {
  opacity: 0;
  transform: scale(0.95);
}
@keyframes pulse {
  0%,
  100% {
    transform: translate(-50%, -50%) scale(1);
  }
  50% {
    transform: translate(-50%, -50%) scale(1.1);
  }
}
</style>
