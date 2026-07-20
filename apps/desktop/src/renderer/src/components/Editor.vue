<script setup lang="ts">
/**
 * TipTap editor bound to a single tab of a single pane (Phase 4.2/4.3).
 *
 * Exactly one of `tabId` / `groupId` is provided by the parent `EditorPane`:
 *  - `tabId` (tab mode): the editor is bound to that layout-store tab and shows
 *    its note's content. Wrapped in `<KeepAlive>` keyed by `tabId` so switching
 *    tabs within a pane preserves cursor/scroll/undo.
 *  - `groupId` (draft mode): the pane has no active tab, so this is an empty
 *    live editor; the first keystroke lazily creates a note in `groupId` (see
 *    `ensureDraft` → `notes.createDraft`).
 *
 * Content is read per-note from the notes store's content cache
 * (`notes.getContent(noteId)`), NOT a global slot — so background split panes
 * keep their own note's content resident. The editor + status channels are
 * routed to the FOCUSED pane only via the `useEditorStore` registry: this
 * instance registers under `myKey` on editor-ready and the store resolves
 * `editor` from the focused key (set by `NotesView` from the layout store).
 *
 * Dep note: imports ONLY from `@tiptap/vue-3` and `@tiptap/starter-kit`. Both
 * resolve `@tiptap/core` to the same hoisted copy, so the editor and its
 * extensions share one ProseMirror schema. Importing `@tiptap/core` directly
 * here would grab the nested 2.6.6 copy and split the schema.
 */
import { ref, watch, computed, onMounted, onBeforeUnmount, onActivated, onDeactivated } from "vue";
import { useEditor, EditorContent } from "@tiptap/vue-3";
import StarterKit from "@tiptap/starter-kit";
import {
  AttachmentNode,
  TaskItemNode,
  TaskListNode,
  EmbedNode,
  ImageNode,
  CodeBlock,
  Table,
  TableRow,
  TableCell,
  TableHeader,
  SlashCommands,
  FindReplace,
  Underline,
  Highlight
} from "@notesnook-vue/editor-vue";
import { useNotesStore } from "@/stores/notes";
import { useEditorStore } from "@/stores/editor";
import { useEditorLayoutStore } from "@/stores/editor-layout";
import { useStatusStore } from "@/stores/status";
import { usePropertiesStore } from "@/stores/properties";
import { useCollectionsStore } from "@/stores/collections";
import { textStats } from "@/utils/properties";
import { useLinksStore } from "@/stores/links";
import { readEditorStats } from "@/utils/status";
import {
  createImageDropPasteProps,
  wireAttachmentStorage
} from "@/editor/attachments-bridge";
import EditorToolbar from "./EditorToolbar.vue";
import FindBar from "./FindBar.vue";

const props = defineProps<{ tabId?: string; groupId?: string }>();

const notes = useNotesStore();
const layout = useEditorLayoutStore();
const editorStore = useEditorStore();
const status = useStatusStore();
const properties = usePropertiesStore();
const collections = useCollectionsStore();
const links = useLinksStore();

// --- This editor's tab / note (from the layout store, NOT the global active) -
// `tabId` → bound to that tab; `groupId` → draft mode (no tab yet). Exactly one
// prop is provided by `EditorPane`. `myNoteId`/`myNote` drive every read below
// so a background pane never reflects the focused pane's note.
const myTab = computed(() =>
  props.tabId ? layout.tabs[props.tabId] ?? null : null
);
const myNoteId = computed<string | null>(() => myTab.value?.noteId ?? null);
const myGroupId = computed<string>(() => myTab.value?.groupId ?? props.groupId ?? "");
const myNote = computed(() =>
  myNoteId.value ? notes.items.find((n) => n.id === myNoteId.value) ?? null : null
);
const myContentState = computed(
  () => notes.getContent(myNoteId.value ?? "")?.state ?? "idle"
);
/** Registry key: `tabId` in tab mode, `"draft:" + groupId` in draft mode. */
const myKey = computed(() => props.tabId ?? "draft:" + (props.groupId ?? ""));

// --- Per-tab find & replace bar --------------------------------------------
// `findOpen` is local + per-instance, so under `<KeepAlive>` each tab keeps its
// own open/closed state (plus the `FindBar`'s own query/replace text). Opened
// by `Cmd/Ctrl+F` (only when this pane is focused — each instance listens) or by
// the "Find in note" palette command (via `editorStore.findSignal`).
const findOpen = ref(false);

// `Cmd/Ctrl+F` opens this pane's find bar — but ONLY when this editor is the
// focused one. Every `Editor.vue` instance mounts this listener; the focused
// check makes split panes cooperate (only the focused pane's bar opens), the
// same rule the status-bar refresh uses (`editorStore.editor === editor.value`).
function onFindHotkey(e: KeyboardEvent): void {
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && (e.key === "f" || e.key === "F")) {
    if (editorStore.editor !== editor.value) return;
    e.preventDefault();
    findOpen.value = true;
  }
}

// Palette "Find in note" command bumps `editorStore.findSignal`; open this
// pane's bar on a bump when focused (mirrors `notes.focusSearchSignal`).
watch(
  () => editorStore.findSignal,
  () => {
    if (editorStore.editor === editor.value) findOpen.value = true;
  }
);

// --- Title (bound to this tab's note `title` field) ------------------------
// Two-way bound to the store so the tab bar + notes list update live as the
// user types; persistence is debounced per-note inside `notes.setTitle` and
// flushed on note switch / deactivate / unmount.
const titleModel = computed<string>({
  get: () => myNote.value?.title ?? "",
  set: (v) => {
    const id = myNoteId.value;
    if (id) notes.setTitle(id, v);
    else void ensureDraft({ title: v });
  }
});

// Title input element. Focused for a freshly created note: the `<input>` lives
// under `<template v-else-if="editor">` (TipTap creates its instance lazily),
// so the reliable signal is the template ref turning non-null — not `onMounted`.
// The one-shot `pendingTitleFocus` flag is set by `notes.create()` and cleared
// here once consumed, so switching to an existing note never grabs the title.
const titleInputEl = ref<HTMLInputElement | null>(null);

watch(
  titleInputEl,
  (el) => {
    if (!el || !notes.pendingTitleFocus) return;
    notes.pendingTitleFocus = false;
    el.focus();
    el.select();
  },
  { flush: "post" }
);

/** Enter in the title → move focus + caret into the editor body (start of the
 * first paragraph). `setTextSelection` takes a NUMERIC position in this TipTap
 * build; `1` is inside the leading paragraph. */
function onTitleEnter(): void {
  const inst = editor.value;
  if (!inst) return;
  inst.chain().focus().setTextSelection(1).run();
}

// --- Tags (assigned to this tab's note via the properties store) ------------
// `properties.tags` auto-reloads on note switch (the store watches
// `activeNoteId`). `collections.tags` is the full sidebar list — the source of
// existing-tag suggestions. Adding a tag the sidebar doesn't know yet creates
// it (`properties.createTag`) then refreshes the sidebar so it appears there.
const tagQuery = ref("");
const tagMenuOpen = ref(false);
const tagInputEl = ref<HTMLInputElement | null>(null);

/** Existing tags matching the query, excluding ones already assigned. */
const tagSuggestions = computed(() => {
  const q = tagQuery.value.trim().toLowerCase();
  const assigned = new Set(properties.tags.map((t) => t.id));
  return collections.tags
    .filter((t) => !assigned.has(t.id))
    .filter((t) => (q ? t.title.toLowerCase().includes(q) : true))
    .slice(0, 8);
});

async function addExistingTag(tagId: string): Promise<void> {
  await properties.addTag(tagId);
  tagQuery.value = "";
  tagMenuOpen.value = false;
  tagInputEl.value?.focus();
}

async function removeAssignedTag(tagId: string): Promise<void> {
  await properties.removeTag(tagId);
}

/** Enter in the tag input: pick an exact existing match if there is one,
 *  otherwise create a new tag and assign it. No-op on empty input. */
async function commitTagInput(): Promise<void> {
  const q = tagQuery.value.trim();
  if (!q) return;
  const exact = collections.tags.find(
    (t) => t.title.toLowerCase() === q.toLowerCase()
  );
  if (exact && !properties.tags.some((t) => t.id === exact.id)) {
    await addExistingTag(exact.id);
    return;
  }
  if (exact) {
    // Already assigned — just clear.
    tagQuery.value = "";
    tagMenuOpen.value = false;
    return;
  }
  const created = await properties.createTag(q);
  if (created) {
    await collections.load();
    tagQuery.value = "";
    tagMenuOpen.value = false;
    tagInputEl.value?.focus();
  }
}

function onTagInputBlur(): void {
  // Defer so a click on a suggestion still fires before we close.
  setTimeout(() => {
    tagMenuOpen.value = false;
  }, 150);
}

// --- Note links (incoming + outgoing) --------------------------------------
// `links` auto-reloads on note switch (the store watches `activeNoteId`).
// Outgoing chips are removable + clickable to open; incoming (backlinks) are
// read-only. The add picker searches the notes list (excluding this note +
// already-linked) — Enter links the first match.
const linkQuery = ref("");
const linkMenuOpen = ref(false);
const linkInputEl = ref<HTMLInputElement | null>(null);

/** Notes matching the query, excluding this note + already-linked. */
const linkSuggestions = computed(() => {
  const q = linkQuery.value.trim().toLowerCase();
  const activeId = myNoteId.value;
  const linked = new Set(links.outgoing.map((l) => l.id));
  return notes.items
    .filter((n) => n.id !== activeId && !linked.has(n.id))
    .filter((n) => (q ? n.title.toLowerCase().includes(q) : true))
    .slice(0, 8);
});

async function addOutgoingLink(noteId: string): Promise<void> {
  await links.link(noteId);
  linkQuery.value = "";
  linkMenuOpen.value = false;
  linkInputEl.value?.focus();
}

async function removeOutgoingLink(noteId: string): Promise<void> {
  await links.unlink(noteId);
}

/** Enter in the link input: link the first matching note, if any. */
async function commitLinkInput(): Promise<void> {
  const first = linkSuggestions.value[0];
  if (first) await addOutgoingLink(first.id);
}

/** Open a linked note IN THIS pane (push it into this group's tab set). */
function openLinkedNote(noteId: string): void {
  layout.openTab(myGroupId.value, noteId);
}

function onLinkInputBlur(): void {
  setTimeout(() => {
    linkMenuOpen.value = false;
  }, 150);
}

// `useEditor` returns a ShallowRef<Editor | undefined>; in the template it
// auto-unwraps, so `:editor="editor"` passes the Editor instance.
// StarterKit's plain `codeBlock` is disabled in favour of our refractor-backed
// `codeblock` (syntax highlighting + lazy language loading + indent/caret
// tracking); both can't own the ```/~~~ input rules at once.
// Table (2.4h) is configured resizable + showResizeHandleOnSelection: the
// vendored columnResizing plugin draws the resize handles; the Vue
// TableComponent owns the <table>/<colgroup>/<tbody> via addNodeView.
const editor = useEditor({
  extensions: [
    StarterKit.configure({ codeBlock: false }),
    AttachmentNode,
    TaskListNode,
    TaskItemNode.configure({ nested: true }),
    EmbedNode,
    ImageNode,
    CodeBlock,
    // Inline marks (Phase 5.3) — pure toggles, no node-view. Underline
    // round-trips as <u>, Highlight as <mark> (plain, no colour picker yet).
    Underline,
    Highlight,
    Table.configure({ resizable: true, showResizeHandleOnSelection: true }),
    TableRow,
    TableCell,
    TableHeader,
    SlashCommands,
    // Per-tab in-content find & replace: a ProseMirror highlight plugin + the
    // `setFind`/`findNext`/`findPrev`/`replace`/`replaceAll`/`clearFind` commands
    // the `FindBar` below drives. State (query, match index) is per-tab here
    // (KeepAlive preserves it across tab switches).
    FindReplace
  ],
  // NOTE: `content` is intentionally empty. The note's content is loaded after
  // mount via `loadCurrentNote()` (see below). Initialising with the note's
  // content here would seed the editor with stale content when this component
  // is keyed by tab id and remounts — and `setContent` into a doc that already
  // has node-views can leave the new content nested inside them (e.g. a table
  // rendered inside the prior code-block). Starting empty and `setContent`-ing
  // into a clean doc avoids that bleed.
  content: "",
  autofocus: false,
  editable: true,
  // Capture OS file drops + clipboard pastes: ingest each file via
  // `db.attachments.save` and insert an image node (image/*) or attachment chip
  // at the drop/caret position. `getEditor` returns the current instance.
  editorProps: createImageDropPasteProps(() => editor.value ?? undefined),
  onUpdate: ({ editor: inst }) => {
    const html = inst.getHTML();
    if (!myNote.value) {
      // No note open yet (draft mode) — the empty editor is a live draft. The
      // first keystroke lazily creates a note seeded with this text (and the
      // title typed so far) in THIS pane's group, without remounting the draft
      // editor; the new tab's editor then mounts and reads the seeded content
      // from the cache. Subsequent edits hit the normal autosave path.
      void ensureDraft({ html });
      return;
    }
    scheduleSave(html);
  }
});

// --- Autosave (debounced), instance-local (flushed on switch/deactivate) -----
// INSTANCE-LOCAL (setup scope, not module scope): a split layout mounts several
// Editor instances; module-scoped debounce state would be shared across them
// and clobber. Each instance owns its own timer + pending note/html. The write
// path (`notes.saveContent(noteId, html)`) already takes an explicit note id.
const SAVE_DEBOUNCE_MS = 800;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pendingNoteId: string | null = null;
let pendingHtml = "";
const saving = ref(false);
const savedAt = ref<number | null>(null);

function scheduleSave(html: string): void {
  const note = myNote.value;
  if (!note) return;
  pendingNoteId = note.id;
  pendingHtml = html;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, SAVE_DEBOUNCE_MS);
}

async function flushSave(): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  const id = pendingNoteId;
  const html = pendingHtml;
  pendingNoteId = null;
  pendingHtml = "";
  if (!id || !html) return;
  saving.value = true;
  await notes.saveContent(id, html);
  saving.value = false;
  savedAt.value = Date.now();
}

// --- Draft creation (no note open → create on first keystroke) -------------
// Draft mode only: the editor surface is empty but live. The first edit (title
// or body) lazily creates a note seeded with what's already typed, in THIS
// pane's group. `notes.createDraft` pre-seeds the content cache with the exact
// bytes the user typed, so the new tab's editor reads them straight from the
// cache (no DB round-trip race). `draftInFlight` coalesces a burst of keystrokes
// into one create; after the note is created we flush the latest buffered title
// and re-seed the autosave pipeline with the editor's current HTML.
let draftInFlight = false;
let draftTitle = "";
let draftHtml = "";

async function ensureDraft(opts: { title?: string; html?: string }): Promise<void> {
  if (opts.title !== undefined) draftTitle = opts.title;
  if (opts.html !== undefined) draftHtml = opts.html;
  if (draftInFlight || myNote.value) return;
  draftInFlight = true;
  try {
    const html = editor.value?.getHTML() ?? draftHtml;
    const id = await notes.createDraft(
      { title: draftTitle, ...(html ? { content: html } : {}) },
      myGroupId.value
    );
    if (!id) return;
    // Flush any title typed during the await window into the new note.
    if (draftTitle) notes.setTitle(id, draftTitle);
    // Re-seed the autosave pipeline with the editor's current HTML so the
    // latest typed text persists even if the user stops typing and switches
    // notes before the 800ms debounce fires.
    const inst = editor.value;
    if (inst) scheduleSave(inst.getHTML());
  } finally {
    draftInFlight = false;
  }
}

// --- Note switching (this tab's note) --------------------------------------
/**
 * When this tab's note changes: flush the previous note's pending edit, load
 * the new note's content, then push it into the editor without triggering an
 * `onUpdate` (so a load never marks the note dirty). The Editor component is
 * keyed by tab id (see `EditorPane`), so a tab switch remounts a fresh editor
 * (empty doc) and this loads the note's content into it.
 *
 * `loadedNoteId` guards against the race where the id watch fires before the
 * editor instance exists (useEditor creates it lazily) — the editor-ready watch
 * below then triggers the load once the editor is available.
 */
let loadedNoteId: string | null = null;

async function loadCurrentNote(): Promise<void> {
  const id = myNoteId.value;
  if (!id) {
    loadedNoteId = null;
    return;
  }
  await notes.loadContent(id);
  // This tab's note may have changed again while loading; bail if so.
  if (myNoteId.value !== id) return;
  const inst = editor.value;
  if (inst) {
    // Wire the attachment-data hook BEFORE `setContent` creates image node-views
    // (see the editor-ready watch for the full rationale). Idempotent.
    wireAttachmentStorage(inst);
    inst.chain().setContent(notes.getContent(id)?.html ?? "", false).run();
    loadedNoteId = id;
  }
}

/** Force-reload this tab's content from DB and `setContent` ONLY when it differs
 *  from the editor's current HTML — so a re-activated (KeepAlive) or remotely-
 *  changed tab refreshes without clobbering the caret when nothing changed.
 *  Skipped while a save is in-flight so an unsaved edit is never overwritten. */
async function reloadIfStale(): Promise<void> {
  if (saving.value) return;
  const id = myNoteId.value;
  if (!id) return;
  await notes.loadContent(id, { force: true });
  const inst = editor.value;
  if (!inst) return;
  const fresh = notes.getContent(id)?.html ?? "";
  if (inst.getHTML() !== fresh) {
    wireAttachmentStorage(inst);
    inst.chain().setContent(fresh, false).run();
  }
}

async function onNoteChange(
  newId: string | null | undefined,
  oldId: string | null | undefined
): Promise<void> {
  if (oldId && oldId !== newId && pendingNoteId === oldId) {
    await flushSave();
  }
  // Flush any pending title edit for the previous note before switching.
  if (oldId && oldId !== newId) {
    await notes.flushTitle(oldId);
  }
  if (!newId) return;
  await loadCurrentNote();
}

watch(
  () => myNoteId.value,
  (newId, oldId) => {
    void onNoteChange(newId, oldId);
  },
  { immediate: true }
);

// Cross-window note sync: another window saved this tab's note. Reload its
// content from DB only when we have no pending save (skip-if-dirty — never
// clobber our own unsaved typing; our next save will win and propagate back).
// `reloadIfStale` `setContent`s with `false`, so the reload does not fire
// `onUpdate` and won't mark the note dirty or re-broadcast. Per-note signal so
// a background split pane showing this note reloads too.
watch(
  () => notes.noteChangedSignalFor(myNoteId.value ?? ""),
  () => {
    if (pendingNoteId !== null || saveTimer) return;
    void reloadIfStale();
  }
);

// Publish the editor instance to the focused-editor registry so the command
// palette + editor-command registry can reach `editor.chain()` for the
// FOCUSED pane only. On the same edge, attach the status-bar listeners (word
// count + cursor position refresh on every edit and caret move) and push an
// initial reading. `refreshStatus` is a no-op unless this editor IS the
// focused one (`editorStore.editor === editor.value`).
function refreshStatus(): void {
  const inst = editor.value;
  if (!inst) return;
  if (editorStore.editor !== inst) return; // only the focused editor pushes
  status.setEditorStats(readEditorStats(inst));
  // Live-stats push to the properties panel (Phase 5.1): word/char/line counts
  // from the editor's plain text, computed on every edit + caret move (same
  // `update`/`selectionUpdate` cadence as the status bar). `textStats` shares
  // the counting rules with the headless `noteStats(html)` path so the panel
  // stays consistent after a save/load reseeds from HTML. Reuses the focused-
  // pane guard above so only the focused editor drives the panel.
  properties.setStats(textStats(inst.getText({ blockSeparator: "\n" })));
}

watch(
  editor,
  (e) => {
    if (e) {
      editorStore.register(myKey.value, e);
      e.on("update", refreshStatus);
      e.on("selectionUpdate", refreshStatus);
      // Wire the attachments storage hooks the image node-view + toolbar image
      // action expect: `getAttachmentData` (lazy blob fetch for hash-only
      // images) + `openAttachmentPicker` (toolbar 🖼 / slash "Image"). Re-wired
      // per editor instance (remounts on tab switch).
      wireAttachmentStorage(e);
      refreshStatus();
      // If the id watch fired before the editor existed, the load was
      // skipped — do it now that the editor is ready.
      if (loadedNoteId !== (myNoteId.value ?? null)) {
        void loadCurrentNote();
      }
    }
  },
  { immediate: true }
);

// Re-push stats when this pane becomes the focused one (focus moved here).
watch(
  () => editorStore.editor === editor.value,
  (mine) => {
    if (mine) refreshStatus();
  },
  { immediate: true }
);

// KeepAlive hooks: a tab deactivated (switched away within a pane) flushes its
// pending save + title so the note is persisted promptly; on reactivation it
// reloads-if-stale (remote edits / edits made elsewhere show up; cursor is
// preserved when nothing changed).
onDeactivated(() => {
  void flushSave();
  void notes.flushTitle(myNoteId.value ?? undefined);
});

onActivated(() => {
  void reloadIfStale();
});

// Register the Cmd/Ctrl+F listener for this pane (see `onFindHotkey`). Added on
// mount; the focused-guard inside the handler ensures only the focused pane
// responds, so split panes don't fight over it.
onMounted(() => {
  window.addEventListener("keydown", onFindHotkey);
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", onFindHotkey);
  const inst = editor.value;
  if (inst) {
    inst.off("update", refreshStatus);
    inst.off("selectionUpdate", refreshStatus);
    editorStore.unregister(myKey.value, inst);
  }
  void flushSave();
  void notes.flushTitle(myNoteId.value ?? undefined);
});

// --- Click empty area below a short note → focus + caret on a new blank line -
// When the window is much taller than the note, the editor surface (`.ProseMirror`,
// capped at `min-height: 60vh`) leaves a dead band of scroll-container background
// below it. Clicking there should not be a no-op: focus the editor and drop the
// caret at the very end, on a fresh empty paragraph (appended only if the last
// block isn't already an empty paragraph, so we never stack two blank lines).
//
// `setTextSelection` in this TipTap build takes a NUMERIC position (or `{from,to}`)
// — the string "end" is NOT accepted and silently drops the caret at the doc
// start, so the caret position is computed explicitly here. `setTextSelection`
// clamps it to the valid range, so the exact value is a safety net, not a cliff.
function onEditorAreaClick(e: MouseEvent): void {
  const inst = editor.value;
  if (!inst) return;
  if (myContentState.value !== "loaded") return;
  // Editor handles its own clicks — only intercept the empty band around/below
  // the content (the scroll container + the `.prose` wrapper margins). The
  // title input + tag chips are interactive meta above/below the note, not
  // part of the editor surface, so their clicks are left to those controls.
  const target = e.target as HTMLElement | null;
  if (target && target.closest(".ProseMirror, .editor-title, .editor-tags, .editor-links")) return;
  const doc = inst.state.doc;
  const last = doc.lastChild;
  const willInsert =
    !last || last.type.name !== "paragraph" || last.childCount > 0;
  // An empty paragraph node is size 2 (open + close tokens). Inserting one at
  // the doc end (`content.size`) puts the caret inside it at `content.size + 1`;
  // when a trailing empty paragraph already exists the caret sits at
  // `content.size - 1` (inside it).
  const caretPos = willInsert ? doc.content.size + 1 : doc.content.size - 1;
  inst.chain()
    .focus()
    .command(({ tr, state, dispatch }) => {
      if (willInsert) {
        tr.insert(
          state.doc.content.size,
          state.schema.nodes.paragraph!.create()
        );
      }
      if (dispatch) dispatch(tr);
      return true;
    })
    .setTextSelection(caretPos)
    .run();
}
</script>

<template>
  <div class="relative flex h-full flex-col bg-glass-surface">
    <EditorToolbar :editor="editor" :saving="saving" :saved-at="savedAt" />
    <FindBar
      v-if="findOpen && editor"
      :editor="editor"
      class="titlebar-no-drag"
      @close="findOpen = false"
    />
    <div class="min-h-0 flex-1 overflow-y-auto p-6" @click="onEditorAreaClick">
      <div v-if="myContentState === 'locked'" class="text-sm text-amber-300/80">
        This note is vault-locked. Unlock arrives in Phase 6.
      </div>
      <div v-else-if="myContentState === 'error'" class="text-sm text-red-300/80">
        Failed to load note content.
      </div>
      <template v-else-if="editor">
        <input
          ref="titleInputEl"
          v-model="titleModel"
          class="editor-title titlebar-no-drag mb-2 w-full bg-transparent text-2xl font-semibold text-text placeholder:text-text-muted focus:outline-none"
          placeholder="Title"
          @keydown.enter.prevent="onTitleEnter"
        />
        <EditorContent :editor="editor" class="prose max-w-none text-sm text-text" />
        <div class="editor-tags mt-4 flex flex-wrap items-center gap-2 border-t border-glass-border pt-3">
          <span
            v-for="tag in properties.tags"
            :key="tag.id"
            class="group inline-flex items-center gap-1 rounded-full bg-glass-active px-2.5 py-1 text-xs text-text"
          >
            <span class="max-w-40 truncate">{{ tag.title }}</span>
            <button
              class="text-text-muted hover:text-text"
              title="Remove tag"
              @click="removeAssignedTag(tag.id)"
            >
              ×
            </button>
          </span>
          <div class="relative inline-flex items-center">
            <input
              ref="tagInputEl"
              v-model="tagQuery"
              class="titlebar-no-drag w-32 rounded-full border border-glass-border bg-glass-surface px-2.5 py-1 text-xs text-text placeholder:text-text-muted focus:border-glass-active focus:outline-none"
              placeholder="Add tag…"
              @focus="tagMenuOpen = true"
              @blur="onTagInputBlur"
              @keydown.enter.prevent="commitTagInput"
            />
            <ul
              v-if="tagMenuOpen && tagSuggestions.length"
              class="absolute bottom-full left-0 z-10 mb-1 max-h-48 w-48 overflow-auto rounded-md border border-glass-border bg-glass-surface py-1 text-xs shadow-lg"
            >
              <li
                v-for="s in tagSuggestions"
                :key="s.id"
                class="cursor-pointer truncate px-2 py-1 text-text hover:bg-glass-hover"
                @mousedown.prevent="addExistingTag(s.id)"
              >
                {{ s.title }}
              </li>
            </ul>
          </div>
        </div>
        <div class="editor-links mt-4 border-t border-glass-border pt-3 text-xs text-text-muted">
          <div class="mb-1 font-medium text-text">Links</div>
          <div class="mb-2 flex flex-wrap items-center gap-2">
            <span class="text-text-muted">Outgoing:</span>
            <button
              v-for="l in links.outgoing"
              :key="'out-' + l.id"
              class="group inline-flex items-center gap-1 rounded-full bg-glass-active px-2.5 py-1 text-xs text-text hover:bg-glass-hover"
              :title="'Open ' + l.title"
              @click="openLinkedNote(l.id)"
            >
              <span class="max-w-40 truncate">{{ l.title }}</span>
              <span
                class="text-text-muted hover:text-text"
                role="button"
                title="Remove link"
                @click.stop="removeOutgoingLink(l.id)"
              >
                ×
              </span>
            </button>
            <span v-if="links.outgoing.length === 0" class="text-text-muted">None</span>
            <div class="relative inline-flex items-center">
              <input
                ref="linkInputEl"
                v-model="linkQuery"
                class="titlebar-no-drag w-40 rounded-full border border-glass-border bg-glass-surface px-2.5 py-1 text-xs text-text placeholder:text-text-muted focus:border-glass-active focus:outline-none"
                placeholder="Link to note…"
                @focus="linkMenuOpen = true"
                @blur="onLinkInputBlur"
                @keydown.enter.prevent="commitLinkInput"
              />
              <ul
                v-if="linkMenuOpen && linkSuggestions.length"
                class="absolute bottom-full left-0 z-10 mb-1 max-h-48 w-56 overflow-auto rounded-md border border-glass-border bg-glass-surface py-1 text-xs shadow-lg"
              >
                <li
                  v-for="s in linkSuggestions"
                  :key="s.id"
                  class="cursor-pointer truncate px-2 py-1 text-text hover:bg-glass-hover"
                  @mousedown.prevent="addOutgoingLink(s.id)"
                >
                  {{ s.title }}
                </li>
              </ul>
            </div>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-text-muted">Incoming:</span>
            <button
              v-for="l in links.incoming"
              :key="'in-' + l.id"
              class="inline-flex items-center rounded-full bg-glass-surface px-2.5 py-1 text-xs text-text hover:bg-glass-hover"
              :title="'Open ' + l.title"
              @click="openLinkedNote(l.id)"
            >
              <span class="max-w-40 truncate">{{ l.title }}</span>
            </button>
            <span v-if="links.incoming.length === 0" class="text-text-muted">None</span>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>