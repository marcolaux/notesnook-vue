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

/** Editor content is stored as HTML (Notesnook `type: "tiptap"` content). */
type ContentState = "idle" | "loading" | "loaded" | "locked" | "error";
type SaveState = "idle" | "saving" | "saved" | "error";

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
 *
 * Content (the note body) is fetched separately via `database.content
 * .findByNoteId` and stored as HTML. Phase-2 spike: round-trips through a
 * TipTap editor in `Editor.vue`.
 */
export const useNotesStore = defineStore("notes", () => {
  const items = ref<NoteListItem[]>([]);
  const openTabs = ref<EditorTab[]>([]);
  const activeTabId = ref<string | null>(null);

  /** HTML content of the active note (`""` when empty / not yet loaded). */
  const activeContent = ref<string>("");
  const contentState = ref<ContentState>("idle");
  const saveState = ref<SaveState>("idle");
  const lastSavedAt = ref<number | null>(null);

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

  /**
   * Load the HTML body of the active note. Vault-locked notes surface as
   * `contentState === "locked"` (unlock is Phase 6).
   */
  async function loadActiveContent(): Promise<void> {
    const note = activeNote.value;
    if (!note) {
      activeContent.value = "";
      contentState.value = "idle";
      return;
    }
    contentState.value = "loading";
    try {
      const db = getDatabase();
      const item = await db.content.findByNoteId(note.id);
      if (item && "locked" in item && item.locked) {
        activeContent.value = "";
        contentState.value = "locked";
        return;
      }
      const data = item && typeof item.data === "string" ? item.data : "";
      activeContent.value = data;
      contentState.value = "loaded";
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[notes] loadActiveContent failed:", e);
      activeContent.value = "";
      contentState.value = "error";
    }
  }

  /**
   * Persist a note's HTML body. Uses `notes.add` with the existing id so the
   * collection upserts content + bumps `dateEdited`/`headline` atomically
   * (the same path the upstream editor uses). Takes an explicit `noteId` so
   * the Editor can flush a pending edit for the *previous* note on switch.
   */
  async function saveContent(noteId: string, html: string): Promise<void> {
    const note = items.value.find((n) => n.id === noteId);
    if (!note) return;
    saveState.value = "saving";
    try {
      const db = getDatabase();
      await db.notes.add({
        id: note.id,
        title: note.title,
        content: { type: "tiptap", data: html },
        localOnly: false,
        pinned: note.pinned,
        favorite: note.favorite,
        readonly: false
      });
      lastSavedAt.value = Date.now();
      saveState.value = "saved";
      // Patch the list item in place so dateEdited/headline stay fresh.
      note.dateEdited = Date.now();
      // headline is regenerated by core from the content; approximate from
      // the first text line for the list until the next full `load()`.
      const firstLine = html
        .replace(/<[^>]+>/g, " ")
        .trim()
        .split(/\s+/)
        .slice(0, 10)
        .join(" ");
      note.headline = firstLine;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[notes] saveContent failed:", e);
      saveState.value = "error";
    }
  }

  return {
    items,
    openTabs,
    activeTabId,
    activeTab,
    activeNote,
    count,
    activeContent,
    contentState,
    saveState,
    lastSavedAt,
    openTab,
    closeTab,
    selectNote,
    load,
    create,
    loadActiveContent,
    saveContent
  };
});