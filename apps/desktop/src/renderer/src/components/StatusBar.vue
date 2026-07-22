<script setup lang="ts">
/**
 * Bottom status bar (Phase 3.4) — four concerns:
 *  - **Sync status** (left): "Local only" when not logged in, else the sync
 *    lifecycle from `useStatusStore` formatted via `syncStatusText`.
 *  - **Autosave indicator** (right): "Saving… / Saved" for the focused pane's
 *    editor (moved here from the editor toolbar; pushed via `setSaveState`).
 *  - **Word count** (right): from the active TipTap editor's text.
 *  - **Cursor position** (right): line/column of the editor caret.
 *
 * Editor stats are pushed by `Editor.vue`; sync state by `App.vue` boot +
 * `@notesnook/core` sync events. When no note is open the word/cursor fields
 * read their zero/origin defaults.
 */
import { computed } from "vue";
import { Icon } from "@notesnook-vue/ui-vue";
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
        <button type="button" class="flex cursor-pointer items-center gap-1 hover:underline" @click="openUpstreamRelease">
          <Icon name="arrow-up" :size="10" /> upstream {{ upstream.status?.latestTag }}
        </button>
        <button
          type="button"
          class="cursor-pointer text-text-muted hover:text-text"
          title="Dismiss until a newer release"
          @click="upstream.dismiss()"
        >
          <Icon name="x" :size="12" />
        </button>
      </span>
    </span>
    <span class="flex items-center gap-3">
      <span v-if="status.saving">Saving…</span>
      <span v-else-if="status.savedAt">Saved</span>
      <span>{{ status.wordCount }} words</span>
      <span>Ln {{ status.cursorLine }}, Col {{ status.cursorColumn }}</span>
    </span>
  </div>
</template>