/**
 * Notebook-picker store (headless) — a tiny Promise-based single-select picker,
 * modeled on {@link stores/dialog.ts}. Used by `notes.create` when a template's
 * notebook policy is "ask" (see `stores/template-notebooks.ts`): the caller
 * awaits `pick(...)` and branches on the result.
 *
 * The visual surface is `components/NotebookPickerDialog.vue`, mounted once in
 * `App.vue`.
 *
 * Result semantics:
 *  - `string`      — a notebook id was chosen (file the note into it).
 *  - `null`        — the user explicitly chose "None" (create the note with no
 *                    template-assigned notebook; the active sidebar filter's
 *                    notebook branch is skipped).
 *  - `undefined`   — cancelled (Esc / backdrop / Cancel button). The caller
 *                    aborts note creation.
 *
 * Only one pick is open at a time. Replacing an already-open pick resolves it
 * with `undefined` first (defensive — the UI only ever opens one at a time,
 * mirroring `dialog.confirm`).
 */
import { defineStore } from "pinia";
import { ref } from "vue";

export interface NotebookPickOptions {
  /** Optional title shown at the top of the dialog. */
  title?: string;
}

type PickResult = string | null | undefined;

interface PendingPick extends NotebookPickOptions {
  resolve: (value: PickResult) => void;
}

export const useNotebookPickerStore = defineStore("notebookPicker", () => {
  /** The active pick request, or `null` when no dialog is open. */
  const pending = ref<PendingPick | null>(null);

  /** Is the picker currently open? */
  const open = ref(false);

  /**
   * Show the notebook picker + return a promise that resolves with the user's
   * choice. See file header for the result semantics.
   */
  function pick(options: NotebookPickOptions = {}): Promise<PickResult> {
    return new Promise<PickResult>((resolve) => {
      if (pending.value) pending.value.resolve(undefined);
      pending.value = { ...options, resolve };
      open.value = true;
    });
  }

  /** Resolve the open pick with `value` and close. No-op when none is open. */
  function resolvePick(value: PickResult): void {
    const p = pending.value;
    pending.value = null;
    open.value = false;
    if (p) p.resolve(value);
  }

  return { pending, open, pick, resolvePick };
});