<script setup lang="ts">
import { ref, watch, computed } from "vue";
import { useNotesStore } from "@/stores/notes";
import { useCollectionsStore } from "@/stores/collections";
import { useShellStore } from "@/stores/shell";
import { groupNotes, highlightSegments, type SortKey, type GroupKey } from "@/utils/notes-list";
import type { NotePreview } from "@/utils/note-preview";

const notes = useNotesStore();
const collections = useCollectionsStore();
const shell = useShellStore();

const searchInput = ref<HTMLInputElement | null>(null);

/** Grouped view of the sorted+filtered list. Flat mode returns one headerless
 * group so the template iterates uniformly; `none` never shows a header. */
const groups = computed(() => groupNotes(notes.visibleItems, notes.groupKey));

/** Typed lookup of a note's list preview (thumbnail + checklist progress). */
function previewOf(id: string): NotePreview | undefined {
  return notes.previews[id];
}

/** Progress-bar width (%) for a note's checklist, or 0 when none. */
function progressWidth(preview: NotePreview): number {
  const c = preview.checklist;
  if (!c || c.total === 0) return 0;
  return (c.checked / c.total) * 100;
}

/** Search-match segments for a note field (empty query → one plain run, so
 * the `<mark>` only renders while a search is active). */
function segmentsOf(text: string): { text: string; match: boolean }[] {
  return highlightSegments(text, notes.query, { regex: notes.regexSearch });
}

/** Clear the active collection filter (chip × or "All Notes"). */
function clearCollectionFilter(): void {
  notes.clearCollectionFilter();
  collections.clearSelection();
}

const sortKeys: { value: SortKey; label: string }[] = [
  { value: "dateEdited", label: "Modified" },
  { value: "dateCreated", label: "Created" },
  { value: "title", label: "Title" }
];

const groupKeys: { value: GroupKey; label: string }[] = [
  { value: "none", label: "No grouping" },
  { value: "date", label: "Date" }
];

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

// "Search notes" palette command bumps `focusSearchSignal`; focus the input.
// DOM focus is a no-op in headless tests, so this is gated for on-site review.
watch(
  () => notes.focusSearchSignal,
  () => {
    if (notes.focusSearchSignal > 0) searchInput.value?.focus();
  }
);
</script>

<template>
  <div class="flex h-full flex-col bg-white/5">
    <div
      class="flex h-10 shrink-0 items-center gap-2 border-b border-white/10 px-3"
    >
      <button
        class="grid h-7 w-7 place-items-center rounded-md text-white/70 hover:bg-white/10"
        title="Collapse sidebar"
        @click="shell.toggleSidebar()"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>
      <input
        ref="searchInput"
        type="text"
        :value="notes.query"
        placeholder="Search…"
        class="titlebar-no-drag min-w-0 flex-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/80 placeholder:text-white/30 focus:border-white/20 focus:outline-none"
        :title="notes.regexSearch ? 'Regex search' : 'Search title / headline / tags'"
        @input="notes.setQuery(($event.target as HTMLInputElement).value)"
      />
      <button
        class="titlebar-no-drag grid h-7 w-7 place-items-center rounded-md text-xs"
        :class="notes.regexSearch ? 'bg-white/20 text-white' : 'text-white/70 hover:bg-white/10'"
        :title="notes.regexSearch ? 'Regex search on' : 'Regex search off'"
        @click="notes.toggleRegex()"
      >
        .*
      </button>
      <button
        v-if="notes.query"
        class="titlebar-no-drag grid h-7 w-7 place-items-center rounded-md text-white/70 hover:bg-white/10"
        title="Clear search"
        @click="notes.clearSearch()"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
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
    <div class="flex h-7 shrink-0 items-center gap-2 border-b border-white/10 px-3 text-[10px] text-white/50">
      <span class="shrink-0">{{ notes.visibleItems.length }}{{ notes.query ? ` / ${notes.count}` : "" }}</span>
      <!-- Active collection filter (notebook/tag) with a clear (×) button. -->
      <span
        v-if="notes.collectionFilter && collections.selectedLabel"
        class="titlebar-no-drag flex shrink-0 items-center gap-1 rounded-full bg-white/10 px-1.5 py-0.5 text-white/70"
      >
        <span class="max-w-[10rem] truncate">{{ collections.selectedLabel }}</span>
        <button
          class="grid h-3.5 w-3.5 place-items-center rounded-full text-white/60 hover:bg-white/20 hover:text-white"
          title="Clear collection filter"
          @click="clearCollectionFilter()"
        >
          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </span>
      <span class="ml-auto flex items-center gap-1">
        <select
          class="titlebar-no-drag rounded-sm border border-white/10 bg-white/5 px-1 py-0.5 text-white/70 focus:outline-none"
          :value="notes.groupKey"
          title="Group by"
          @change="notes.setGroupKey(($event.target as HTMLSelectElement).value as GroupKey)"
        >
          <option v-for="g in groupKeys" :key="g.value" :value="g.value">{{ g.label }}</option>
        </select>
        <select
          class="titlebar-no-drag rounded-sm border border-white/10 bg-white/5 px-1 py-0.5 text-white/70 focus:outline-none"
          :value="notes.sortKey"
          title="Sort by"
          @change="notes.setSortKey(($event.target as HTMLSelectElement).value as SortKey)"
        >
          <option v-for="k in sortKeys" :key="k.value" :value="k.value">{{ k.label }}</option>
        </select>
        <button
          class="titlebar-no-drag grid h-5 w-5 place-items-center rounded-sm text-white/70 hover:bg-white/10"
          :title="notes.sortDir === 'asc' ? 'Ascending' : 'Descending'"
          @click="notes.toggleSortDir()"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path v-if="notes.sortDir === 'asc'" d="M12 19V5M5 12l7-7 7 7" />
            <path v-else d="M12 5v14M5 12l7 7 7-7" />
          </svg>
        </button>
      </span>
    </div>
    <div class="min-h-0 flex-1 overflow-y-auto p-1">
      <template v-for="group in groups" :key="group.key">
        <div
          v-if="group.label"
          class="sticky top-0 z-10 bg-white/5 px-2 py-1 text-[9px] font-semibold uppercase tracking-wide text-white/40"
        >
          {{ group.label }}
        </div>
        <button
          v-for="note in group.items"
          :key="note.id"
          class="block w-full rounded-md px-2 py-1.5 text-left hover:bg-white/10"
          :class="notes.activeNote?.id === note.id ? 'bg-white/15' : ''"
          @click="notes.selectNote(note.id)"
        >
          <div class="flex items-center gap-1">
            <span v-if="note.pinned" class="text-[10px] text-amber-300/80" title="Pinned">📌</span>
            <span v-if="note.favorite" class="text-[10px] text-rose-300/80" title="Favorite">★</span>
            <span class="truncate text-xs font-medium text-white/90">
              <template v-for="(seg, i) in segmentsOf(note.title)" :key="i">
                <mark v-if="seg.match" class="rounded-sm bg-amber-400/30 px-0.5 text-white">{{ seg.text }}</mark>
                <template v-else>{{ seg.text }}</template>
              </template>
            </span>
          </div>
          <div class="mt-1 flex items-start gap-2">
            <!-- First-image thumbnail (attachment-backed images resolve in Phase 6). -->
            <img
              v-if="previewOf(note.id)?.thumbnail"
              :src="previewOf(note.id)!.thumbnail ?? undefined"
              alt=""
              class="h-8 w-8 shrink-0 rounded-sm object-cover"
              draggable="false"
            />
            <div class="min-w-0 flex-1">
              <div class="truncate text-[10px] text-white/40">
                <template v-if="note.headline">
                  <template v-for="(seg, i) in segmentsOf(note.headline)" :key="i">
                    <mark v-if="seg.match" class="rounded-sm bg-amber-400/30 px-0.5 text-white/70">{{ seg.text }}</mark>
                    <template v-else>{{ seg.text }}</template>
                  </template>
                </template>
                <template v-else>No additional text</template>
              </div>
              <!-- Checklist progress bar (x / y checked). -->
              <div
                v-if="previewOf(note.id)?.checklist && previewOf(note.id)!.checklist!.total > 0"
                class="mt-1 flex items-center gap-1"
              >
                <div class="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
                  <div
                    class="h-full rounded-full bg-emerald-400/70"
                    :style="{ width: `${progressWidth(previewOf(note.id)!)}%` }"
                  />
                </div>
                <span class="shrink-0 text-[8px] text-white/40">
                  {{ previewOf(note.id)!.checklist!.checked }}/{{ previewOf(note.id)!.checklist!.total }}
                </span>
              </div>
            </div>
          </div>
          <div class="mt-0.5 flex items-center gap-1.5 text-[9px] text-white/30">
            <span>{{ formatDate(note.dateEdited) }}</span>
            <span
              v-for="tag in note.tags.slice(0, 3)"
              :key="tag"
              class="rounded-sm bg-white/10 px-1 text-white/50"
            >#{{ tag }}</span>
          </div>
        </button>
      </template>
      <div v-if="notes.visibleItems.length === 0 && notes.query" class="px-2 py-4 text-center text-[10px] text-white/30">
        No notes match “{{ notes.query }}”
      </div>
      <div v-else-if="notes.items.length === 0" class="px-2 py-4 text-center text-[10px] text-white/30">
        No notes yet
      </div>
    </div>
  </div>
</template>