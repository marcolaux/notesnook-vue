import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type { Note } from "@notesnook-vue/contracts";

interface NoteListItem {
  id: string;
  title: string;
  preview: string;
  dateModified: number;
}

interface EditorTab {
  id: string;
  noteId: string;
  title: string;
}

/**
 * Notes store — calls into `@notesnook/core`'s `database.notes` collection.
 *
 * For now this is a placeholder backed by in-memory stub data so the UI can
 * render during scaffolding. The real wiring lives in
 * `src/platform/database.ts` and will replace `items` with the result of
 * `database.notes.all(...)`.
 */
export const useNotesStore = defineStore("notes", () => {
  const items = ref<NoteListItem[]>([]);
  const openTabs = ref<EditorTab[]>([]);
  const activeTabId = ref<string | null>(null);

  const count = computed(() => items.value.length);

  function openTab(note: NoteListItem): void {
    const existing = openTabs.value.find((t) => t.noteId === note.id);
    if (existing) {
      activeTabId.value = existing.id;
      return;
    }
    const tab: EditorTab = {
      id: crypto.randomUUID(),
      noteId: note.id,
      title: note.title
    };
    openTabs.value.push(tab);
    activeTabId.value = tab.id;
  }

  function closeTab(tabId: string): void {
    const idx = openTabs.value.findIndex((t) => t.id === tabId);
    if (idx === -1) return;
    openTabs.value.splice(idx, 1);
    if (activeTabId.value === tabId) {
      activeTabId.value = openTabs.value[idx - 1]?.id ?? openTabs.value[0]?.id ?? null;
    }
  }

  // Real API stub — will call `database.notes.all()` once platform wiring lands.
  async function load(): Promise<void> {
    items.value = [];
  }

  return { items, openTabs, activeTabId, count, openTab, closeTab, load };
});

// Re-export the Note type so consumers can import it from the store module too.
export type { Note };