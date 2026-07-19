<script setup lang="ts">
import { useShellStore } from "@/stores/shell";

const shell = useShellStore();
</script>

<template>
  <div
    class="titlebar-drag flex h-10 shrink-0 items-center gap-2 border-b border-white/10 bg-white/5 px-3 backdrop-blur-2xl"
  >
    <button
      class="titlebar-no-drag grid h-7 w-7 place-items-center rounded-md text-sm text-white/70 hover:bg-white/10"
      title="Toggle Sidebar"
      @click="shell.toggleSidebar()"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <line x1="9" y1="3" x2="9" y2="21" />
      </svg>
    </button>
    <div class="text-xs font-medium text-white/80">Notesnook</div>
    <div class="ml-auto flex items-center gap-1">
      <span class="text-[10px] text-white/40">v0.0.1</span>
    </div>
  </div>
</template>