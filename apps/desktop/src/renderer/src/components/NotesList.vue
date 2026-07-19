<script setup lang="ts">
defineProps<{ sidebarCollapsed: boolean }>();
defineEmits<{ "toggle-sidebar": [] }>();

import { useNotesStore } from "@/stores/notes";

const notes = useNotesStore();

function formatDate(ts: number): string {
  if (!ts) return "";
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (sameDay) return time;
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric"
  });
}
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
        @click="notes.create()"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>
    </div>
    <div class="min-h-0 flex-1 overflow-y-auto p-1">
      <button
        v-for="note in notes.items"
        :key="note.id"
        class="block w-full rounded-md px-2 py-1.5 text-left hover:bg-white/10"
        :class="notes.activeNote?.id === note.id ? 'bg-white/15' : ''"
        @click="notes.selectNote(note.id)"
      >
        <div class="flex items-center gap-1">
          <span v-if="note.pinned" class="text-[10px] text-amber-300/80" title="Pinned">📌</span>
          <span v-if="note.favorite" class="text-[10px] text-rose-300/80" title="Favorite">★</span>
          <span class="truncate text-xs font-medium text-white/90">{{ note.title }}</span>
        </div>
        <div class="truncate text-[10px] text-white/40">{{ note.headline || "No additional text" }}</div>
        <div class="mt-0.5 flex items-center gap-1.5 text-[9px] text-white/30">
          <span>{{ formatDate(note.dateEdited) }}</span>
          <span
            v-for="tag in note.tags.slice(0, 3)"
            :key="tag"
            class="rounded-sm bg-white/10 px-1 text-white/50"
          >#{{ tag }}</span>
        </div>
      </button>
      <div v-if="notes.items.length === 0" class="px-2 py-4 text-center text-[10px] text-white/30">
        No notes yet
      </div>
    </div>
  </div>
</template>