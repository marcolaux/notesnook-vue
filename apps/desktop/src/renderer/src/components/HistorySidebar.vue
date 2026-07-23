<script setup lang="ts">
/**
 * Per-tab note-history timeline sidebar.
 *
 * Mounted as a right-hand sibling of the `Editor` inside `EditorPane.vue`
 * (only for note tabs whose `historyVisible` flag is set). Shows a vertical
 * timeline of the note's saved versions (newest-first) as an ACCORDION: each
 * entry is collapsed to its timestamp by default, and clicking one expands
 * ONLY that entry — its line-diff of what that save changed versus the
 * previous (older) version (the oldest shows as "Initial version"), plus the
 * full content preview + a Restore button. Any other open entry collapses.
 *
 * Data comes from `db.noteHistory` via the per-instance
 * {@link useNoteHistoryTimeline} composable (scoped to THIS tab's note id, not
 * the global active note — so split panes each show their own tab's history).
 * A revision's body is fetched on demand when its entry is expanded (and its
 * older sibling's with it, so the diff can be computed). Vault-locked revisions
 * render a locked badge with no diff (decryption is vault-gated).
 */
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Icon } from "@notesnook-vue/ui-vue";
import { useEditorLayoutStore } from "@/stores/editor-layout";
import { useNoteHistoryTimeline } from "@/composables/use-note-history-timeline";
import type { HistoryEntry } from "@/utils/note-history";
import type { DiffLine } from "@/utils/note-history-diff";

const props = defineProps<{ tabId: string }>();
const { t } = useI18n();
const layout = useEditorLayoutStore();

const tab = computed(() => layout.tabs[props.tabId] ?? null);
const noteId = computed<string | null>(() => tab.value?.noteId ?? null);

const timeline = useNoteHistoryTimeline(noteId);
const {
  sessions,
  loading,
  busy,
  lastError,
  loadContent,
  isLoaded,
  isLocked,
  diffFor,
  bodyOf,
  restore
} = timeline;

/** Max diff lines shown before the "show more" toggle (for the open entry). */
const COMPACT_DIFF_LINES = 6;

/** The single expanded entry's session id (accordion — one open at a time, or
 *  `null` when all are collapsed). */
const expandedId = ref<string | null>(null);
/** "Show full diff" toggle for the currently expanded entry. */
const showFullDiff = ref(false);

/** Relative time formatter ("just now" / "5m ago" / "2h ago" / absolute date). */
function timeAgo(ms: number): string {
  const now = Date.now();
  const diff = Math.max(0, now - ms);
  const min = 60_000;
  const hr = 60 * min;
  const day = 24 * hr;
  if (diff < min) return t("history.justNow");
  if (diff < hr) return `${Math.floor(diff / min)}m ago`;
  if (diff < day) return `${Math.floor(diff / hr)}h ago`;
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
  return new Date(ms).toLocaleDateString();
}

/** Truncate a diff to the compact line budget (unless `showFullDiff`). */
function compactDiff(diff: DiffLine[]): DiffLine[] {
  return showFullDiff.value ? diff : diff.slice(0, COMPACT_DIFF_LINES);
}

/**
 * Toggle one entry's expanded state (accordion). Expanding loads that entry's
 * body + its older sibling's (so the diff can be computed); collapsing just
 * hides it. Only the clicked entry is ever open — any other collapses.
 */
function toggleExpand(entry: HistoryEntry): void {
  if (expandedId.value === entry.id) {
    expandedId.value = null;
    showFullDiff.value = false;
    return;
  }
  expandedId.value = entry.id;
  showFullDiff.value = false;
  void loadContent(entry.id);
  const idx = sessions.value.findIndex((s) => s.id === entry.id);
  const older = sessions.value[idx + 1];
  if (older) void loadContent(older.id);
}

// Close the accordion when the note changes (the expanded id no longer belongs
// to this note's revision list).
watch(noteId, () => {
  expandedId.value = null;
  showFullDiff.value = false;
});

async function onRestore(entry: HistoryEntry): Promise<void> {
  if (!confirm(t("history.restoreConfirm"))) return;
  const ok = await restore(entry.id);
  if (ok) {
    expandedId.value = null;
    showFullDiff.value = false;
  }
}

/** Strip HTML to plain text for the expanded content preview. */
function plainText(html: string): string {
  if (!html) return "";
  const txt = new DOMParser().parseFromString(html, "text/html").body.textContent ?? "";
  return txt.trim();
}
</script>

<template>
  <div
    class="flex min-h-0 min-w-0 h-full flex-col bg-glass-surface"
    :data-history-sidebar="props.tabId"
  >
    <div
      class="flex shrink-0 items-center justify-between gap-2 border-b border-glass-border px-3 py-2"
    >
      <span class="truncate text-xs font-medium text-text">{{ t("history.title") }}</span>
      <button
        type="button"
        class="grid h-6 w-6 shrink-0 place-items-center rounded text-text-muted hover:bg-glass-hover hover:text-text"
        :title="t('common.close')"
        @click="layout.toggleHistory(props.tabId)"
      >
        <Icon name="x" :size="16" />
      </button>
    </div>

    <div class="relative min-h-0 flex-1 overflow-auto px-3 py-2">
      <div v-if="loading" class="p-4 text-xs text-text-muted">{{ t("history.loading") }}</div>
      <div
        v-else-if="sessions.length === 0"
        class="p-4 text-xs text-text-muted"
      >
        {{ t("history.empty") }}
      </div>

      <ol v-else class="relative m-0 list-none p-0">
        <!-- vertical connector line -->
        <span class="absolute left-[5px] top-2 bottom-2 w-px bg-glass-border" />
        <li
          v-for="entry in sessions"
          :key="entry.id"
          class="relative ml-5 mb-2"
        >
          <!-- node dot -->
          <span
            class="absolute -left-[18px] top-1 h-[11px] w-[11px] rounded-full border-2 border-glass-border bg-glass-surface"
          />

          <!-- header (click to expand ONLY this entry) -->
          <button
            type="button"
            class="flex w-full items-center gap-1 text-left text-xs text-text-muted hover:text-text"
            :title="new Date(entry.dateModified).toLocaleString()"
            @click="toggleExpand(entry)"
          >
            <Icon
              :name="expandedId === entry.id ? 'chevron-down' : 'chevron-right'"
              :size="12"
              class="shrink-0 opacity-60"
            />
            <span class="font-medium">{{ timeAgo(entry.dateModified) }}</span>
            <span
              v-if="isLocked(entry.id)"
              class="ml-1 inline-flex items-center gap-1 rounded bg-glass-hover px-1 py-0.5 text-[10px] text-text-muted"
            >
              <Icon name="lock" :size="10" />{{ t("history.locked") }}
            </span>
          </button>

          <!-- expanded body: diff + preview + restore (only the open entry) -->
          <div v-if="expandedId === entry.id" class="mt-1">
            <!-- diff block -->
            <div
              v-if="!isLocked(entry.id)"
              class="overflow-hidden rounded border border-glass-border bg-glass-bg"
            >
              <div v-if="!isLoaded(entry.id)" class="px-2 py-1 text-[11px] text-text-muted">
                …
              </div>
              <template v-else-if="diffFor(entry) === null">
                <!-- older sibling not loaded yet → wait -->
              </template>
              <div
                v-else-if="(diffFor(entry)?.length ?? 0) === 0"
                class="px-2 py-1 text-[11px] italic text-text-muted"
              >
                {{ t("history.initialVersion") }}
              </div>
              <div v-else class="font-mono text-[11px] leading-snug">
                <div
                  v-for="(line, i) in compactDiff(diffFor(entry)!)"
                  :key="i"
                  class="whitespace-pre-wrap break-words px-2 py-0.5"
                  :class="{
                    'bg-[color-mix(in_srgb,var(--accent-success)_10%,transparent)] text-[var(--paragraph-success)]': line.type === 'add',
                    'bg-[color-mix(in_srgb,var(--accent-error)_10%,transparent)] text-[var(--paragraph-error)]': line.type === 'del',
                    'text-text-muted': line.type === 'ctx'
                  }"
                >
                  <span class="select-none opacity-60">{{
                    line.type === "add" ? "+" : line.type === "del" ? "−" : " "
                  }}</span
                  >{{ line.text }}
                </div>
                <button
                  v-if="(diffFor(entry)?.length ?? 0) > COMPACT_DIFF_LINES"
                  type="button"
                  class="block w-full px-2 py-0.5 text-left text-[10px] text-text-muted hover:text-text"
                  @click="showFullDiff = !showFullDiff"
                >
                  {{ showFullDiff ? t("history.showLess") : t("history.showMore") }}
                </button>
              </div>
            </div>

            <!-- full content preview + restore -->
            <div class="mt-2 rounded border border-glass-border bg-glass-bg p-2">
              <pre
                v-if="bodyOf(entry.id)"
                class="m-0 max-h-60 overflow-auto whitespace-pre-wrap break-words font-sans text-[11px] leading-relaxed text-text"
                >{{ plainText(bodyOf(entry.id)!) }}</pre
              >
              <div v-else-if="isLocked(entry.id)" class="text-[11px] text-text-muted">
                {{ t("history.locked") }}
              </div>
              <button
                type="button"
                class="mt-2 inline-flex items-center gap-1 rounded border border-glass-border bg-glass-hover px-2 py-1 text-[11px] text-text hover:bg-glass-active disabled:opacity-40"
                :disabled="busy"
                @click="onRestore(entry)"
              >
                <Icon name="rotate-ccw" :size="12" />{{ t("history.restore") }}
              </button>
            </div>
          </div>
        </li>
      </ol>

      <div v-if="lastError" class="mt-2 text-[11px] text-[var(--paragraph-error)]">{{ lastError }}</div>
    </div>
  </div>
</template>