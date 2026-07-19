<script setup lang="ts">
import { useNotesStore } from "@/stores/notes";

const notes = useNotesStore();
</script>

<template>
  <div class="flex h-full flex-col bg-white/5">
    <div class="flex h-9 shrink-0 items-center gap-1 border-b border-white/10 px-2">
      <div class="flex items-end gap-px overflow-x-auto">
        <div
          v-for="tab in notes.openTabs"
          :key="tab.id"
          class="group flex items-center gap-1 border-r border-white/5 bg-white/5 px-3 py-1.5 text-xs text-white/70"
        >
          <span class="max-w-32 truncate">{{ tab.title }}</span>
          <button
            class="opacity-0 group-hover:opacity-100 hover:text-white"
            @click="notes.closeTab(tab.id)"
          >
            ×
          </button>
        </div>
      </div>
      <div class="ml-auto flex gap-1 text-white/50">
        <button class="grid h-6 w-6 place-items-center hover:bg-white/10" title="Search">🔍</button>
        <button class="grid h-6 w-6 place-items-center hover:bg-white/10" title="Table of Contents">📋</button>
      </div>
    </div>
    <div class="min-h-0 flex-1 overflow-y-auto p-6">
      <div class="prose prose-invert max-w-none text-sm text-white/80">
        <p class="text-white/30">
          Editor placeholder — TipTap integration lands next.
        </p>
      </div>
    </div>
  </div>
</template>