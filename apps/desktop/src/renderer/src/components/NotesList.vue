<script setup lang="ts">
defineProps<{ sidebarCollapsed: boolean }>();
defineEmits<{ "toggle-sidebar": [] }>();

import { useNotesStore } from "@/stores/notes";

const notes = useNotesStore();
</script>

<template>
  <div class="flex h-full flex-col bg-white/5">
    <div
      class="flex h-10 shrink-0 items-center gap-2 border-b border-white/10 px-3"
    >
      <button
        class="grid h-7 w-7 place-items-center rounded-md text-white/70 hover:bg-white/10"
        title="Collapse sidebar"
        @click="$emit('toggle-sidebar')"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>
      <input
        type="text"
        placeholder="Search…"
        class="min-w-0 flex-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/80 placeholder:text-white/30 focus:border-white/20 focus:outline-none"
      />
      <button
        class="titlebar-no-drag grid h-7 w-7 place-items-center rounded-md text-white/70 hover:bg-white/10"
        title="New Note"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>
    </div>
    <div class="min-h-0 flex-1 overflow-y-auto p-1">
      <div
        v-for="note in notes.items"
        :key="note.id"
        class="rounded-md px-2 py-1.5 hover:bg-white/10"
      >
        <div class="truncate text-xs font-medium text-white/90">{{ note.title }}</div>
        <div class="truncate text-[10px] text-white/40">{{ note.preview }}</div>
      </div>
      <div v-if="notes.items.length === 0" class="px-2 py-4 text-center text-[10px] text-white/30">
        No notes yet
      </div>
    </div>
  </div>
</template>