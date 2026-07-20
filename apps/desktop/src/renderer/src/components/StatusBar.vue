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
import { useUpstreamNotifierStore } from "@/stores/upstream-notifier";
import { syncStatusText } from "@/utils/status";

const status = useStatusStore();
const auth = useAuthStore();
const upstream = useUpstreamNotifierStore();

// `status.now` is a reactive wall-clock (bumped by the status store's
// interval) so the relative sync time stays accurate without a store nudge.
const syncText = computed(() =>
  syncStatusText(auth.isLoggedIn, status.syncState, status.lastSynced, status.hasUnsyncedChanges, status.now)
);

// Upstream-release indicator: shown when a newer `streetwriters/notesnook`
// desktop release exists than the one we built against. Click opens the
// release page; the dismiss button hides it until a newer tag appears.
function openUpstreamRelease(): void {
  const url = upstream.status?.latestUrl;
  if (url) window.open(url, "_blank");
}
</script>

<template>
  <div
    class="flex h-6 shrink-0 items-center justify-between border-t border-glass-border bg-glass-surface px-3 text-[10px] text-text-muted"
  >
    <span class="flex shrink-0 items-center gap-2">
      <span>{{ syncText }}</span>
      <span
        v-if="upstream.hasNewer"
        class="flex items-center gap-1 rounded bg-accent/15 px-1.5 py-px text-accent"
        :title="`Upstream ${upstream.status?.latestTag} is newer than the ${upstream.status?.baselineTag} you built against — click to view`"
      >
        <button type="button" class="cursor-pointer hover:underline" @click="openUpstreamRelease">
          ↑ upstream {{ upstream.status?.latestTag }}
        </button>
        <button
          type="button"
          class="cursor-pointer text-text-muted hover:text-text"
          title="Dismiss until a newer release"
          @click="upstream.dismiss()"
        >
          ×
        </button>
      </span>
    </span>
    <span class="flex items-center gap-3">
      <span>{{ status.wordCount }} words</span>
      <span>Ln {{ status.cursorLine }}, Col {{ status.cursorColumn }}</span>
    </span>
  </div>
</template>