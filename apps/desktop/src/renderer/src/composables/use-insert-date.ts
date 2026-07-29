/**
 * Host wiring for the editor-vue "insert date" action (`insertDate`). The action
 * lives in `packages/editor-vue` (decoupled from any popup/UI) and calls a
 * host-installed handler; this module installs that handler once at app boot
 * (mirroring `use-editor-labels.ts`'s label-resolver install) so the slash
 * "Date" command + the palette "Insert date" command open the host's date
 * picker (`stores/insert-date.ts` + `DatePickerPopup.vue`).
 *
 * `openInsertDate(editor)` positions the popup at the editor's cursor
 * (`editor.coordsAtPos(selection.from)`), falling back to the viewport centre
 * when the coords can't be resolved.
 */
import type { Editor } from "@tiptap/vue-3";
import { setInsertDateHandler } from "@notesnook-vue/editor-vue";
import { useInsertDateStore } from "@/stores/insert-date";

let installed = false;

/** Open the date picker for `editor`, positioned at the editor's cursor (or the
 *  viewport centre if the cursor coords can't be resolved). */
export function openInsertDate(editor: Editor): void {
  const store = useInsertDateStore();
  let px = window.innerWidth / 2;
  let py = window.innerHeight / 2;
  try {
    if (!editor.isDestroyed) {
      const coords = editor.view.coordsAtPos(editor.state.selection.from);
      px = coords.left;
      py = coords.bottom + 4;
    }
  } catch {
    // coordsAtPos can throw for an odd doc/selection — keep the centre fallback.
  }
  store.openFor(editor, px, py);
}

/** Install the host "insert date" picker opener. Call once at app boot.
 *  Idempotent. */
export function installInsertDateHandler(): void {
  if (installed) return;
  installed = true;
  setInsertDateHandler((editor: Editor) => openInsertDate(editor));
}