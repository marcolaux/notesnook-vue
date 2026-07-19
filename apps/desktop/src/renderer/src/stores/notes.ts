import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type { Note } from "@notesnook-vue/contracts";
import { getDatabase } from "@/platform/bootstrap";

export interface NoteListItem {
  id: string;
  title: string;
  headline: string;
  dateCreated: number;
  dateEdited: number;
  tags: string[];
  pinned: boolean;
  favorite: boolean;
}

interface EditorTab {
  id: string;
  noteId: string;
  title: string;
}

function toListItem(n: Note): NoteListItem {
  return {
    id: n.id,
    title: n.title || "Untitled",
    headline: n.headline ?? "",
    dateCreated: n.dateCreated,
    dateEdited: n.dateEdited,
    tags: (n.tags ?? []).filter((t): t is string => typeof t === "string"),
    pinned: n.pinned,
    favorite: n.favorite
  };
}

/**
 * Notes store — reads from `@notesnook/core`'s `database.notes` collection.
 */
export const useNotesStore = defineStore("notes", () => {
  const items = ref<NoteListItem[]>([]);
  const openTabs = ref<EditorTab[]>([]);
  const activeTabId = ref<string | null>(null);

  const count = computed(() => items.value.length);

  const activeTab = computed(() => openTabs.value.find((t) => t.id === activeTabId.value) ?? null);
  const activeNote = computed(() =>
    items.value.find((n) => n.id === activeTab.value?.noteId) ?? null
  );

  function openTab(note: Pick<NoteListItem, "id" | "title">): void {
    const existing = openTabs.value.find((t) => t.noteId === note.id);
    if (existing) {
      activeTabId.value = existing.id;
      return;
    }
    const tab: EditorTab = { id: crypto.randomUUID(), noteId: note.id, title: note.title };
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

  function selectNote(id: string): void {
    const item = items.value.find((n) => n.id === id);
    if (item) openTab(item);
  }

  /** Load all notes from the database into the list. */
  async function load(): Promise<void> {
    const db = getDatabase();
    const all = await db.notes.all.items();
    items.value = all.map(toListItem);
  }

  /** Create a new note, reload, and open it in a tab. */
  async function create(): Promise<void> {
    const db = getDatabase();
    const id = await db.notes.add({ title: "New note" });
    await load();
    const item = items.value.find((n) => n.id === id);
    if (item) openTab(item);
  }

  return {
    items,
    openTabs,
    activeTabId,
    activeTab,
    activeNote,
    count,
    openTab,
    closeTab,
    selectNote,
    load,
    create
  };
});