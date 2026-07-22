<script setup lang="ts">
/**
 * TipTap editor bound to a single tab of a single pane (Phase 4.2/4.3).
 *
 * Exactly one of `tabId` / `groupId` is provided by the parent `EditorPane`:
 *  - `tabId` (tab mode): the editor is bound to that layout-store tab and shows
 *    its note's content. Wrapped in `<KeepAlive>` keyed by `tabId` so switching
 *    tabs within a pane preserves cursor/scroll/undo.
 *  - `groupId` (draft mode): the pane has no active tab, so this is an empty
 *    live editor; typing starts a debounce and a note is created in `groupId`
 *    once typing PAUSES (see `scheduleDraft` → `ensureDraft` →
 *    `notes.createDraft`).
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
  Highlight,
  // Phase 5.5 toolbar marks/options — re-exported by editor-vue so it owns
  // every extension the editor loads (one import surface; same hoisted
  // 2.6.6 `@tiptap/core` as StarterKit — see the header note on schema
  // sharing). `TextStyle` carries `color`/`fontFamily`; `Color`+`FontFamily`
  // set them; `TextAlign` applies to paragraph + heading.
  Subscript,
  Superscript,
  TextStyle,
  Color,
  FontFamily,
  TextAlign,
  // Tag-mention (Phase 5.4): inline `#tag` chip node + `#`-triggered picker.
  TagMention,
  TagSuggest
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
import { scrollEditorToMatch } from "@/utils/search-scroll";
import {
  createImageDropPasteProps,
  wireAttachmentStorage
} from "@/editor/attachments-bridge";
import { wireEditorColorPicker } from "@/editor/color-bridge";
import { wireTagMention } from "@/editor/tag-mention-bridge";
import { goToCollection } from "@/utils/collection-nav";
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
/** Draft mode: this pane has no tab yet, so the editor is an empty live surface
 *  that creates a note on the first keystroke. Drives the minimal draft UI —
 *  no toolbar, no tags/links footer, and a "create a note" title placeholder. */
const isDraft = computed(() => !myNoteId.value);
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

// The editor-toolbar magnifying-glass button bumps `findToggleSignal` — it
// TOGGLES this pane's bar (closes it when already open) rather than only
// opening. Same focused-pane guard as the open-only signal above.
watch(
  () => editorStore.findToggleSignal,
  () => {
    if (editorStore.editor === editor.value) findOpen.value = !findOpen.value;
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
    else scheduleDraft({ title: v });
  }
});

// Title input element. Focused for a freshly created note: the `<input>` lives
// under `<template v-else-if="editor">` (TipTap creates its instance lazily),
// so the reliable signal is the template ref turning non-null — not `onMounted`.
// The one-shot `pendingTitleFocus` flag is set by `notes.create()` ("select":
// focus + select-all over the placeholder) or `notes.createDraft()` ("end":
// focus + caret at end, so a draft created mid-typing keeps the just-typed
// letter) and cleared here once consumed, so switching to an existing note
// never grabs the title.
const titleInputEl = ref<HTMLInputElement | null>(null);

watch(
  titleInputEl,
  (el) => {
    const mode = notes.pendingTitleFocus;
    if (!el || !mode) return;
    notes.pendingTitleFocus = null;
    el.focus();
    if (mode === "select") {
      el.select();
    } else {
      // "end" — place the caret after the last character so continued typing
      // appends rather than clobbering the title typed in the draft editor.
      const end = el.value.length;
      el.setSelectionRange(end, end);
    }
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

/** Click a footer tag chip → go to that tag's note list. The current note stays
 *  open in the editor; only the notes list is re-filtered. */
function goToTag(tagId: string): void {
  void goToCollection("tag", tagId);
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
    // Inline marks (Phase 5.3/5.5) — pure toggles, no node-view. Underline
    // round-trips as <u>. Highlight is multicolor so the toolbar colour
    // submenu can set per-highlight colours (plain toggle still works for the
    // default). Subscript/superscript are plain toggles. FontFamily + Color
    // (text colour) ride on TextStyle; TextAlign applies to paragraph +
    // heading (the node types the toolbar alignment dropdown targets).
    Underline,
    Highlight.configure({ multicolor: true }),
    Subscript,
    Superscript,
    TextStyle,
    FontFamily,
    Color,
    TextAlign.configure({ types: ["heading", "paragraph"] }),
    Table.configure({ resizable: true, showResizeHandleOnSelection: true }),
    TableRow,
    TableCell,
    TableHeader,
    SlashCommands,
    // Per-tab in-content find & replace: a ProseMirror highlight plugin + the
    // `setFind`/`findNext`/`findPrev`/`replace`/`replaceAll`/`clearFind` commands
    // the `FindBar` below drives. State (query, match index) is per-tab here
    // (KeepAlive preserves it across tab switches).
    FindReplace,
    // Tag-mention (Phase 5.4): `TagMention` (inline `#tag` chip node, must
    // register before `TagSuggest` so the schema exists when the suggestion
    // plugin inserts chips) + `TagSuggest` (the `#`-triggered picker; its own
    // PluginKey so it doesn't collide with `SlashCommands`).
    TagMention,
    TagSuggest
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
      // No note open yet (draft mode) — the empty editor is a live draft.
      // Buffer this keystroke and defer note creation until typing pauses
      // (see `scheduleDraft`): creating on the first keystroke would remount
      // mid-burst and lose characters typed during the creation window.
      scheduleDraft({ html });
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

/** Mirror this pane's autosave state into the shared status store so the bottom
 *  status bar can render "Saving… / Saved" (moved off the editor toolbar). Only
 *  the FOCUSED pane drives the bar — same guard as {@link refreshStatus}. */
function pushSaveState(): void {
  if (editorStore.editor !== editor.value) return;
  status.setSaveState(saving.value, savedAt.value);
}

// Push whenever the autosave flags flip, and re-sync on focus move (handled in
// the focused watch below, which also calls refreshStatus → pushSaveState).
watch([saving, savedAt], pushSaveState);

// --- Draft creation (no note open → create after typing pauses) ------------
// Draft mode only: the editor surface is empty but live. The first edit (title
// or body) starts a debounce timer; the note is created only once typing
// PAUSES for `DRAFT_DEBOUNCE_MS`. This is essential: creating on the first
// keystroke remounts the editor (draft → tab) mid-burst, and characters typed
// during the creation+remount window never reach the new editor — typing
// "asdf" fast kept only "a". By deferring creation to the pause, the draft
// editor accumulates the whole burst, the user is no longer typing when the
// remount runs, and the new tab's editor loads the complete text from the
// re-seeded cache. `draftInFlight` guards the async create itself.
let draftInFlight = false;
let draftTimer: ReturnType<typeof setTimeout> | null = null;
const DRAFT_DEBOUNCE_MS = 400;
let draftTitle = "";
let draftHtml = "";
/** Where the user was typing at the moment creation fires — decides post-
 *  remount focus (title input vs body caret). Updated on every keystroke so it
 *  reflects the LAST surface, then read when the debounce fires. */
let draftFocusBody = false;

/** Buffer a draft keystroke and (re)start the creation debounce. Called from
 *  `titleModel.set` / `onUpdate` while in draft mode. Each call refreshes the
 *  buffer + the focus target and pushes the create out to the pause. */
function scheduleDraft(opts: { title?: string; html?: string }): void {
  if (opts.title !== undefined) {
    draftTitle = opts.title;
    draftFocusBody = false;
  }
  if (opts.html !== undefined) {
    draftHtml = opts.html;
    draftFocusBody = true;
  }
  if (draftInFlight || myNote.value) return;
  if (draftTimer) clearTimeout(draftTimer);
  draftTimer = setTimeout(() => {
    draftTimer = null;
    void ensureDraft();
  }, DRAFT_DEBOUNCE_MS);
}

async function ensureDraft(): Promise<void> {
  if (draftInFlight || myNote.value) return;
  draftInFlight = true;
  const focusBody = draftFocusBody;
  try {
    const html = editor.value?.getHTML() ?? draftHtml;
    const id = await notes.createDraft(
      { title: draftTitle, ...(html ? { content: html } : {}) },
      myGroupId.value,
      focusBody ? "body" : "title",
      // Re-capture the draft editor's HTML right before the remount (inside
      // createDraft, just before openTab) so the cache is seeded with the FULL
      // text. With the pause-debounce the user isn't typing during the
      // db.add/load await, so this equals the buffered content — the getter is
      // kept as a belt-and-suspenders in case the await window overlaps a late
      // keystroke (the editor is still alive here, before openTab runs).
      () => editor.value?.getHTML() ?? draftHtml
    );
    if (!id) return;
    // Flush any title typed before the pause into the new note (the body is
    // already preserved via the getLatestContent re-seed above).
    if (draftTitle) notes.setTitle(id, draftTitle);
    // NOTE: do NOT `scheduleSave(editor.value.getHTML())` here — by the time
    // this `await` resumes, Vue has already flushed the remount and the draft
    // editor is destroyed, so reading it would schedule a save of a stale/
    // empty snapshot that, after the 800ms debounce, would wipe the just-
    // typed content. The new tab's Editor loaded the full text from the
    // re-seeded cache and will persist it through its own autosave / the
    // deactivate/unmount flush, exactly like any other edit.
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
  // Load content + this note's assigned tag ids in parallel. The tag ids feed
  // the `reconcileTagMentions` call below so orphan chips (a tag removed while
  // this note was closed, or on another device) are stripped on open. Id-aware
  // read (not `properties.tags`, which reflects only the focused pane).
  const [html, tagIds] = await Promise.all([
    notes.loadContent(id).then(() => notes.getContent(id)?.html ?? ""),
    properties.getAssignedTagIds(id)
  ]);
  // This tab's note may have changed again while loading; bail if so.
  if (myNoteId.value !== id) return;
  // Queue server downloads of this note's image/webclip attachments so their
  // blobs land locally; the image node-views lazy-load via `getAttachmentData`
  // and re-load on `EVENTS.mediaAttachmentDownloaded` (see attachments-bridge).
  // Fire-and-forget — no blob = placeholder, matching pre-sync behaviour.
  notes.downloadMedia(id);
  const inst = editor.value;
  if (inst) {
    // Wire the attachment-data hook BEFORE `setContent` creates image node-views
    // (see the editor-ready watch for the full rationale). Idempotent.
    wireAttachmentStorage(inst, () => myGroupId.value);
    // Reconcile is chained onto the `setContent(…, false)` chain so the strip
    // shares the single non-emitting transaction (no `onUpdate` → no autosave
    // → no eager DB rewrite; the orphan chip leaves saved content only on the
    // next real edit, matching the lazy-reconcile contract). `silent` also sets
    // `preventUpdate` so the chip-deletion handler skips unassign for it.
    inst
      .chain()
      .setContent(html, false)
      .reconcileTagMentions(tagIds, { silent: true })
      .run();
    loadedNoteId = id;
    // Draft promoted by a BODY keystroke: the user was typing in the body, so
    // after the seeded content is loaded focus the editor + place the caret at
    // the end of the body (mirrors the empty-band-click caret idiom: `content
    // .size - 1` lands inside the last block at its end, without inserting a new
    // paragraph — the user is mid-typing, not starting a fresh line). Consumed
    // here (not in a separate watch) so it runs AFTER `setContent` seeds the
    // doc the caret resolves against.
    if (notes.pendingBodyFocus) {
      notes.pendingBodyFocus = false;
      const end = inst.state.doc.content.size - 1;
      inst.chain().focus().setTextSelection(end).run();
    }
    // Global-search scroll-to-match — consume HERE, right after `setContent`
    // has populated the editor doc. A decoupled reactive watcher on
    // `myContentState` (the DB content-load flag) races: that flag flips to
    // "loaded" when `notes.loadContent` resolves, which is BEFORE the
    // `setContent` chain runs, so the watcher would consume the target against
    // an empty doc (size 2 → zero matches). Running it here guarantees the
    // doc is seeded. The target is keyed by `myKey` (tabId) so only this tab
    // consumes it; clear-on-read prevents stale re-application. `scrollEditorToMatch`
    // then defers the actual scroll to a raf + re-scrolls over the image-load
    // window (async images expand the layout after `setContent`).
    const scrollKey = myKey.value;
    const target = editorStore.pendingScrollTargetFor(scrollKey);
    if (target) {
      editorStore.clearPendingScrollTarget(scrollKey);
      // eslint-disable-next-line no-console
      console.log("[search-scroll] consume target", scrollKey, target.query, target.matchIndex);
      scrollEditorToMatch(inst, target.query, target.matchIndex, target.options);
    }
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
  const [fresh, tagIds] = await Promise.all([
    notes.loadContent(id, { force: true }).then(
      () => notes.getContent(id)?.html ?? ""
    ),
    properties.getAssignedTagIds(id)
  ]);
  const inst = editor.value;
  if (!inst) return;
  if (inst.getHTML() !== fresh) {
    wireAttachmentStorage(inst, () => myGroupId.value);
    // Chain the cosmetic reconcile so a stale reload of a note that still has
    // orphan chips in saved content re-strips them (see `loadCurrentNote`).
    inst
      .chain()
      .setContent(fresh, false)
      .reconcileTagMentions(tagIds, { silent: true })
      .run();
    // A remote change may have introduced images whose blobs aren't local yet
    // — queue their downloads so they don't sit on placeholders.
    notes.downloadMedia(id);
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
  pushSaveState();
  // Live-stats push to the properties panel (Phase 5.1): word/char/line counts
  // from the editor's plain text, computed on every edit + caret move (same
  // `update`/`selectionUpdate` cadence as the status bar). `textStats` shares
  // the counting rules with the headless `noteStats(html)` path so the panel
  // stays consistent after a save/load reseeds from HTML. Reuses the focused-
  // pane guard above so only the focused editor drives the panel.
  properties.setStats(textStats(inst.getText({ blockSeparator: "\n" })));
}

let disposeTagMention: (() => void) | null = null;

watch(
  editor,
  (e) => {
    if (e) {
      editorStore.register(myKey.value, e);
      // Publish this pane's autosave flusher so the publish store can force the
      // FOCUSED pane's pending save to disk before `db.monographs.publish`
      // reads `db.content.get` (see `editorStore.flushFocusedSave`). Registered
      // alongside the editor; unregistered on unmount.
      editorStore.registerFlusher(myKey.value, flushSave);
      e.on("update", refreshStatus);
      e.on("selectionUpdate", refreshStatus);
      // Wire the attachments storage hooks the image node-view + toolbar image
      // action expect: `getAttachmentData` (lazy blob fetch for hash-only
      // images) + `openAttachmentPicker` (toolbar 🖼 / slash "Image"), plus
      // `openAttachmentPreview` (double-click a chip → preview pane). `getGroupId`
      // resolves this editor's pane so the preview splits from the right pane.
      // Re-wired per editor instance (remounts on tab switch).
      wireAttachmentStorage(e, () => myGroupId.value);
      // Wire the host colour-picker hook the `textColor` / `highlight` toolbar
      // actions (kind "color") + palette entries invoke: opens a native
      // `<input type="color">` and applies the chosen hex to the text colour or
      // highlight mark. Idempotent; re-wired per editor instance (see color-bridge).
      wireEditorColorPicker(e);
      // Wire the `#` tag picker hooks the `TagSuggest` extension reads:
      // `getTagSuggestions` (filter the sidebar tag list) + `assignTag`
      // (create/attach via the properties store), plus the two-way chip↔tag
      // sync (chip-deletion detection + a `properties.tags` reconcile watcher).
      // `getNoteId` is a getter so the bridge stays valid across draft→promote
      // (the editor instance is stable but the note id resolves only after the
      // first keystroke). Returns a disposer (tears down the transaction
      // listener + the watch) captured for cleanup on the next editor swap /
      // unmount.
      disposeTagMention?.();
      disposeTagMention = wireTagMention(e, () => myNoteId.value);
      refreshStatus();
      // If the id watch fired before the editor existed, the load was
      // skipped — do it now that the editor is ready. Also force a load when a
      // global-search scroll target is pending for THIS tab: picking a search
      // result whose note is already the active note (or whose content is
      // cached) would otherwise skip the load here (loadedNoteId already
      // matches), so the content would never display in the new tab. The target
      // is keyed by `myKey` (tabId) so only this tab consumes it.
      if (
        loadedNoteId !== (myNoteId.value ?? null) ||
        editorStore.pendingScrollTargetFor(myKey.value) !== undefined
      ) {
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

onActivated(async () => {
  await reloadIfStale();
  // Global-search reuse of an already-open note: the search store stages a
  // pending scroll target keyed by this tab's id and reactivates the tab via
  // `openTab`. A fresh tab consumes its target in `loadCurrentNote`, but a
  // reactivated KeepAlive-cached tab doesn't re-run `loadCurrentNote` (noteId
  // + editor instance unchanged) — so consume it here, after `reloadIfStale`
  // has settled so a stale-refresh `setContent` can't reset the doc after we
  // scroll. The editor is already populated (cached), so `scrollEditorToMatch`
  // runs against the live doc.
  const inst = editor.value;
  const key = myKey.value;
  const target = editorStore.pendingScrollTargetFor(key);
  if (target && inst && !inst.isDestroyed) {
    editorStore.clearPendingScrollTarget(key);
    // eslint-disable-next-line no-console
    console.log("[search-scroll] consume target (reactivated)", key, target.query, target.matchIndex);
    scrollEditorToMatch(inst, target.query, target.matchIndex, target.options);
  }
});

// Register the Cmd/Ctrl+F listener for this pane (see `onFindHotkey`). Added on
// mount; the focused-guard inside the handler ensures only the focused pane
// responds, so split panes don't fight over it.
onMounted(() => {
  window.addEventListener("keydown", onFindHotkey);
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", onFindHotkey);
  // Cancel any pending draft creation: if this draft editor is unmounting
  // before the debounce fired, the user navigated away mid-burst (an explicit
  // abandonment), so don't create a note for the half-typed text. (When
  // creation succeeds, the timer already fired → it's null here, so this is a
  // no-op in the normal promotion path.)
  if (draftTimer) {
    clearTimeout(draftTimer);
    draftTimer = null;
  }
  const inst = editor.value;
  if (inst) {
    inst.off("update", refreshStatus);
    inst.off("selectionUpdate", refreshStatus);
    editorStore.unregister(myKey.value, inst);
  }
  editorStore.unregisterFlusher(myKey.value);
  // Tear down the tag-mention bridge (transaction listener + properties.tags
  // watch) so a per-tab editor doesn't leak its store subscription on unmount.
  disposeTagMention?.();
  disposeTagMention = null;
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
//
// Track where the press STARTED. A `click` fires on the scroll container
// whenever the mousedown and mouseup targets share it as an ancestor — so
// dragging a text selection that starts inside `.ProseMirror` and releases on
// the padding band (or the tags/links meta) fires this handler too. That's NOT
// an "empty-band click": the user was selecting text and simply released past
// the editor's edge. Acting on it would `.focus()` + `setTextSelection(end)`
// and clobber their selection. So bail when the press began inside the editor.
let mouseDownInEditor = false;
function onAreaMouseDown(e: MouseEvent): void {
  const t = e.target as HTMLElement | null;
  mouseDownInEditor = !!(t && t.closest(".ProseMirror"));
}
function onEditorAreaClick(e: MouseEvent): void {
  const inst = editor.value;
  if (!inst) return;
  if (myContentState.value !== "loaded") return;
  // Press began inside the editor (text selection released outside it) — leave
  // the editor's selection alone.
  if (mouseDownInEditor) return;
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
    <EditorToolbar v-if="!isDraft" :editor="editor" />
    <FindBar
      v-if="findOpen && editor"
      :editor="editor"
      class="titlebar-no-drag"
      @close="findOpen = false"
    />
    <div class="min-h-0 flex-1 overflow-y-auto p-6" @mousedown="onAreaMouseDown" @click="onEditorAreaClick">
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
          :placeholder="isDraft ? 'Type here to create a new note...' : 'Title'"
          @keydown.enter.prevent="onTitleEnter"
        />
        <EditorContent :editor="editor" class="prose max-w-none text-sm text-text" />
        <div
          v-if="!isDraft"
          class="editor-tags mt-4 flex flex-wrap items-center gap-2 border-t border-glass-border pt-3"
        >
          <span
            v-for="tag in properties.tags"
            :key="tag.id"
            class="group inline-flex items-center gap-1 rounded-full bg-glass-active px-2.5 py-1 text-xs text-text hover:bg-glass-hover"
          >
            <button
              type="button"
              class="max-w-40 cursor-pointer truncate hover:underline"
              :title="`Show notes tagged #${tag.title}`"
              @click="goToTag(tag.id)"
            >{{ tag.title }}</button>
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
          <!-- Word count + cursor position for the focused pane's editor,
               pushed in by this Editor via status.setEditorStats on every
               update/selectionUpdate. Right-aligned in the tags footer. -->
          <span class="ml-auto shrink-0 text-[10px] text-text-muted">
            {{ status.wordCount }} words · Ln {{ status.cursorLine }}, Col {{ status.cursorColumn }}
          </span>
        </div>
        <div v-if="!isDraft" class="editor-links mt-4 border-t border-glass-border pt-3 text-xs text-text-muted">
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