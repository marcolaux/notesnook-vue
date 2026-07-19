<script setup lang="ts">
/**
 * Bottom status bar (Phase 3.4) — three concerns:
 *  - **Sync status** (left): "Local only" when not logged in, else the sync
 *    lifecycle from `useStatusStore` formatted via `syncStatusText`.
 *  - **Word count** (right): from the active TipTap editor's text.
 *  - **Cursor position** (right): line/column of the editor caret.
 *
 * Editor stats are pushed by `Editor.vue`; sync state by `App.vue` boot +
 * `@notesnook/core` sync events. When no note is open the word/cursor fields
 * read their zero/origin defaults.
 */
import { computed } from "vue";
import { useStatusStore } from "@/stores/status";
import { useAuthStore } from "@/stores/auth";
import { syncStatusText } from "@/utils/status";

const status = useStatusStore();
const auth = useAuthStore();

const syncText = computed(() =>
  syncStatusText(auth.isLoggedIn, status.syncState, status.lastSynced)
);
</script>

<template>
  <div
    class="flex h-6 shrink-0 items-center justify-between border-t border-white/10 bg-white/5 px-3 text-[10px] text-white/40"
  >
    <span class="shrink-0">{{ syncText }}</span>
    <span class="flex items-center gap-3">
      <span>{{ status.wordCount }} words</span>
      <span>Ln {{ status.cursorLine }}, Col {{ status.cursorColumn }}</span>
    </span>
  </div>
</template>