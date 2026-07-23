import { defineStore } from "pinia";
import { shallowRef, ref, computed } from "vue";
import type { Editor } from "@tiptap/vue-3";
import type { SearchOptions } from "@notesnook-vue/editor-vue";

/**
 * A staged scroll-to-match target set by the global search before opening a
 * result note (`layout.openTab` — reuse-or-create). The tab's `Editor.vue`
 * consumes it (after `setContent` in `loadCurrentNote` for a fresh tab, or in
 * `onActivated` for a reactivated KeepAlive-cached tab, or directly from the
 * search store when the editor is already live) and scrolls the editor to the
 * match. Clear-on-read prevents a stale re-application.
 */
export interface PendingScrollTarget {
  query: string;
  /** Which match to scroll to (0 = first); clamped to the match list in the
   *  editor. The results tab passes the snippet index; the dropdown passes 0. */
  matchIndex: number;
  options?: SearchOptions;
}

/**
 * A live editor's scrollable surface, published by each `Editor.vue` so the
 * per-tab ToC/Minimap right sidebar (a SIBLING of the editor inside
 * `EditorPane`, not a child — so `provide/inject` can't cross) can reach THIS
 * pane's DOM: the heading outline scrolls to a heading, the minimap mirrors
 * the content + syncs the viewport slider to scroll. Keyed by the same
 * per-instance key as the editor `registry` (`tabId`, or `"draft:" + groupId`).
 */
export interface EditorSurface {
  /** The editor's overflow scroll container (the `overflow-y-auto` div). */
  scrollEl: HTMLElement;
  /** The `.ProseMirror` content element (the sized, styled document). */
  contentEl: HTMLElement;
  /** Scroll so a fraction `0..1` of the document is above the viewport. */
  scrollToFraction(fraction: number): void;
  /** Scroll a heading into view at the top of the editor and place the caret
   *  at its start. `id` is the ToC id (tried as `[id=…]` first); `text` is the
   *  heading's visible text (the reliable match — our editor strips heading
   *  ids on parse). No-op if not found. */
  scrollToHeading(id: string, text: string): void;
}

/**
 * Cross-component channel for the *focused* pane's TipTap `Editor` instance
 * (Phase 4.2 — split-pane aware).
 *
 * Each `Editor.vue` (one per tab/pane) owns its editor via `useEditor`, but the
 * command palette + editor-action registry need to reach `editor.chain()` for
 * the **focused** pane only. A single last-writer-wins slot would clobber on
 * every background-pane mount/keystroke, so instead this store holds a
 * `registry` of every live editor keyed by a stable per-instance key
 * (`tabId`, or `"draft:" + groupId` for an empty pane's draft editor) plus a
 * `focusedKey` set by the view from the layout store
 * (`layout.activeTab?.id ?? "draft:" + layout.activeGroupId`). The `editor`
 * computed resolves the focused key's instance — race-free, and `undefined`
 * when the focused pane has no live editor (e.g. an empty pane before its
 * editor mounts).
 *
 * `Editor.vue` registers on editor-ready and unregisters on unmount
 * (cache-evict / pane close). The ref is a plain `Record` of `Editor` instances
 * (not deeply reactive — the Editor is a large, self-managed ProseMirror object;
 * deep reactivity would be wasteful and could interfere with its state).
 * `isEditable` is the only reactive view consumers need.
 */
export const useEditorStore = defineStore("editor", () => {
  // `shallowRef` so the stored `Editor` instances are NOT deep-proxied (the
  // Editor is a large self-managed ProseMirror object; proxying it would break
  // `===` identity checks and could interfere with its state). Reassigning
  // `.value` on register/unregister still triggers the `editor` computed.
  const registry = shallowRef<Record<string, Editor>>({});
  const focusedKey = ref<string | null>(null);

  // Per-pane autosave flushers (Phase 5.1 — publish-with-images). Each
  // `Editor.vue` owns a debounced `flushSave` in its setup scope (instance-local
  // so split panes don't clobber each other's pending html). The publish store
  // needs to force the FOCUSED pane's pending save to disk BEFORE
  // `db.monographs.publish` reads `db.content.get(note.contentId)` — otherwise a
  // just-inserted image whose autosave debounce hasn't fired is absent from the
  // stored content, and `downloadMedia` finds no `data-hash` to embed. A signal
  // bump can't be awaited (publish must await the flush), so this holds the
  // actual async flusher keyed by the same `myKey` as the editor registry.
  // `shallowRef` + immutable replace so registration triggers reactivity
  // without deep-proxying the function map.
  const flushers = shallowRef<Record<string, () => Promise<void>>>({});
  // Per-tab editor surfaces (Phase 5.2 — ToC/Minimap right sidebar). Each
  // `Editor.vue` publishes its scroll/content elements so the ToC + Minimap
  // (siblings of the editor) can drive scroll for THIS pane. `shallowRef` +
  // immutable replace (same pattern as `registry`/`flushers`) — the surface
  // objects are plain DOM handles, not deeply reactive.
  const surfaces = shallowRef<Record<string, EditorSurface>>({});
  /** Bumped by the "Find in note" palette command; each `Editor.vue` watches it
   *  and opens its find bar when it is the focused pane (mirrors
   *  `notes.focusSearchSignal` — a palette entry point that needs no global
   *  keybinding to reach the per-tab component state). */
  const findSignal = ref(0);

  /** Register a live editor under `key` (overwrites on re-register — same key,
   *  same instance under KeepAlive). */
  function register(key: string, e: Editor): void {
    registry.value = { ...registry.value, [key]: e };
  }

  /** Drop the editor registered under `key` (no-op if it's no longer the one
   *  stored — avoids clobbering a re-registered instance of the same key). */
  function unregister(key: string, e: Editor): void {
    if (registry.value[key] === e) {
      const next = { ...registry.value };
      delete next[key];
      registry.value = next;
    }
  }

  /** Register the per-pane autosave flusher (see {@link flushSave}). Overwrites
   *  on re-register (same key, same Editor instance under KeepAlive). */
  function registerFlusher(key: string, fn: () => Promise<void>): void {
    flushers.value = { ...flushers.value, [key]: fn };
  }

  /** Drop the flusher registered under `key`. */
  function unregisterFlusher(key: string): void {
    if (!(key in flushers.value)) return;
    const next = { ...flushers.value };
    delete next[key];
    flushers.value = next;
  }

  /** Register a live editor's scrollable surface under `key` (overwrites on
   *  re-register — same key under KeepAlive). */
  function registerSurface(key: string, surface: EditorSurface): void {
    surfaces.value = { ...surfaces.value, [key]: surface };
  }

  /** Drop the surface registered under `key` (no-op if it's no longer the one
   *  stored — avoids clobbering a re-registered surface of the same key). */
  function unregisterSurface(key: string, surface: EditorSurface): void {
    if (surfaces.value[key] !== surface) return;
    const next = { ...surfaces.value };
    delete next[key];
    surfaces.value = next;
  }

  /** The live surface registered under `key`, or `undefined` (no editor mounted
   *  for that pane/tab). Used by the ToC/Minimap sidebar to drive THIS pane's
   *  editor scroll. */
  function getSurface(key: string): EditorSurface | undefined {
    return surfaces.value[key];
  }

  /** Force the focused pane's pending autosave to disk and await it. No-op (a
   *  resolved promise) when no flusher is registered for the focused pane (no
   *  editor mounted, or the focused pane is an attachment/empty pane). Used by
   *  the publish store to ensure `db.content.get` reflects the latest edits
   *  before `db.monographs.publish`. Never throws — a flush failure is logged
   *  and swallowed so a publish isn't blocked by a save error. */
  async function flushFocusedSave(): Promise<void> {
    const key = focusedKey.value;
    if (!key) return;
    const fn = flushers.value[key];
    if (!fn) return;
    try {
      await fn();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[editor] flushFocusedSave failed:", e);
    }
  }

  /** Set the focused key (the view computes this from the layout store). */
  function setFocusedKey(key: string | null): void {
    focusedKey.value = key;
  }

  /** Bump the find-signal (called by the "Find in note" palette command).
   *  Each `Editor.vue` watches it and opens its find bar when it is the focused
   *  pane (mirrors `notes.focusSearchSignal` — a palette entry point that needs
   *  no global keybinding to reach the per-tab component state). */
  function requestFind(): void {
    findSignal.value++;
  }

  /** Bump the find-toggle-signal: like `requestFind` but the focused pane
   *  TOGGLES its find bar instead of only opening it — so the toolbar
   *  magnifying-glass button closes the bar when it's already open. Kept
   *  separate from `findSignal` so the palette command + ⌘F stay open-only
   *  (standard "open find" semantics) while the icon is a toggle. */
  const findToggleSignal = ref(0);
  function requestFindToggle(): void {
    findToggleSignal.value++;
  }

  // --- global-search scroll-to-match ----------------------------------------
  // When a global-search result is opened (`layout.openTab` — reuse-or-create),
  // the search store stages a "pending scroll target" here keyed by the tab's id
  // (`myKey` in `Editor.vue`), so only that tab consumes it. Consumption has
  // three paths (see `search.openNoteAt`): the search store scrolls directly
  // when the tab's editor is already live + DOM-attached; `Editor.vue`'s
  // `onActivated` consumes it for a reactivated KeepAlive-cached tab; and
  // `loadCurrentNote` consumes it after `setContent` for a fresh tab. Keying by
  // tabId (not noteId) ensures only the right tab acts on it. `shallowRef` —
  // the record is small and replaced immutably. Clear-on-read prevents a stale
  // re-application.
  const pendingScrollTargets = shallowRef<Record<string, PendingScrollTarget>>({});

  function setPendingScrollTarget(key: string, target: PendingScrollTarget): void {
    pendingScrollTargets.value = { ...pendingScrollTargets.value, [key]: target };
  }

  function pendingScrollTargetFor(key: string): PendingScrollTarget | undefined {
    return pendingScrollTargets.value[key];
  }

  /** The live editor registered under `key`, or `undefined` (no editor mounted
   *  for that pane/tab, or it was unregistered on unmount). Used by the global
   *  search store to decide whether a search result whose note is ALREADY open
   *  can be scrolled directly (editor live + DOM attached) vs. staged for a
   *  lifecycle hook to consume (cached/deactivated tab, or brand-new tab). */
  function getEditor(key: string): Editor | undefined {
    return registry.value[key];
  }

  function clearPendingScrollTarget(key: string): void {
    if (!(key in pendingScrollTargets.value)) return;
    const next = { ...pendingScrollTargets.value };
    delete next[key];
    pendingScrollTargets.value = next;
  }

  /** The focused pane's editor, or `undefined` when none is live. */
  const editor = computed<Editor | undefined>(
    () => (focusedKey.value ? registry.value[focusedKey.value] : undefined)
  );

  const isEditable = computed(() => editor.value?.isEditable ?? false);

  return {
    registry,
    focusedKey,
    findSignal,
    findToggleSignal,
    pendingScrollTargets,
    editor,
    isEditable,
    register,
    unregister,
    setFocusedKey,
    requestFind,
    requestFindToggle,
    setPendingScrollTarget,
    pendingScrollTargetFor,
    clearPendingScrollTarget,
    getEditor,
    registerFlusher,
    unregisterFlusher,
    flushFocusedSave,
    surfaces,
    registerSurface,
    unregisterSurface,
    getSurface
  };
});