/**
 * Block-colorize host bridge — wires `editor.storage.blockColorize` (the hook
 * the `blockColorize` editor action's `run`/`isActive` read) to the
 * per-note/global-default state in `stores/block-colorize`, and keeps the
 * editor's `.block-colorize` root class + list-depth decorations in sync with
 * the effective state for THIS editor's note.
 *
 * Mirrors the attachment/color/tag-mention bridges: a pure function that
 * mutates `editor.storage` + installs a reactive `watch`, returns a disposer
 * (Editor.vue tears it down on editor swap / unmount). No Pinia needed at
 * module top — the store is plain module-level refs.
 *
 * The editor-vue `BlockColorize` extension owns the `data-list-level`
 * decorations and reads `storage.blockColorize.enabled` to gate them; this
 * bridge writes `enabled` and dispatches a no-op meta-transaction (the plugin
 * key) so the decorations recompute on a pure enable flip (no doc change). The
 * same dispatch bumps the toolbar `version` (EditorToolbar listens to the
 * editor `"transaction"` event) so the toggle button's `isActive` re-reads
 * storage and reflects the new state.
 */
import type { Editor } from "@tiptap/vue-3";
import { computed, watch, type WatchStopHandle } from "vue";
import {
  blockColorizePluginKey,
  type BlockColorizeStorage
} from "@notesnook-vue/editor-vue";
import { effectiveBlockColorize, toggleBlockColorize } from "@/stores/block-colorize";

/** Apply the effective on/off state to a single editor instance. Mutates
 *  `storage.blockColorize.enabled`, toggles the `.block-colorize` root class,
 *  and — only when the state actually changed — dispatches a no-op
 *  meta-transaction so the list-depth plugin recomputes and the toolbar
 *  refreshes. No-op if the editor is destroyed. */
function applyToEditor(editor: Editor, enabled: boolean): void {
  if (editor.isDestroyed) return;
  const storage = editor.storage as { blockColorize?: BlockColorizeStorage };
  if (!storage.blockColorize) {
    storage.blockColorize = { enabled };
  }
  const prev = storage.blockColorize.enabled;
  storage.blockColorize.enabled = enabled;
  editor.view.dom.classList.toggle("block-colorize", enabled);
  if (prev !== enabled) {
    // No-step transaction: ProseMirror history ignores it (no doc steps), so
    // undo is unaffected. The meta key forces the decoration plugin to rebuild.
    editor.view.dispatch(editor.state.tr.setMeta(blockColorizePluginKey, true));
  }
}

/**
 * Wire the block-colorize hook + reactive re-apply for an editor instance.
 * `getNoteId` is a getter so the bridge stays valid across draft→promote (the
 * editor instance is stable but the note id resolves only after the first
 * keystroke — same idiom as `wireTagMention`/`wireNoteLink`).
 *
 * Returns a disposer that stops the reactive watch; call on editor destroy /
 * component unmount.
 */
export function wireBlockColorize(
  editor: Editor,
  getNoteId: () => string | null
): () => void {
  const storage = editor.storage as { blockColorize?: BlockColorizeStorage };
  if (!storage.blockColorize) {
    storage.blockColorize = { enabled: false };
  }
  // The toolbar `blockColorize` action invokes this; it flips the effective
  // state for THIS editor's note (or the global default when there's no note).
  storage.blockColorize.toggle = (): void => {
    if (editor.isDestroyed) return;
    toggleBlockColorize(getNoteId());
  };

  // Reactive effective state for this note. Re-evaluates when the global
  // default, the per-note overrides, or the note id changes (all read inside
  // the computed). The watch re-applies to the editor on every change.
  const enabled = computed(() => effectiveBlockColorize(getNoteId()));

  // Apply once immediately (initial state for a freshly created editor) and on
  // every subsequent change. `flush: "post"` so the DOM class toggle happens
  // after Vue's DOM updates, not mid-render.
  const stop: WatchStopHandle = watch(
    enabled,
    (v) => applyToEditor(editor, v),
    { flush: "post", immediate: true }
  );

  return () => {
    stop();
    // Best-effort: remove the root class on teardown so a remount doesn't
    // briefly inherit a stale colorize state from the reused DOM node.
    if (!editor.isDestroyed) {
      editor.view.dom.classList.remove("block-colorize");
    }
  };
}