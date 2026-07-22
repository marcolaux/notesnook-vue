/**
 * Dialog store (headless) — a tiny generic confirm-dialog state used by the
 * context-menu's destructive entries (delete notebook/tag). Promise-based so
 * the caller can `await confirm({...})` and branch on the boolean, exactly
 * like a native `window.confirm` but theme-consistent (the `ConfirmDialog.vue`
 * overlay is mounted once in `App.vue`).
 *
 * Only confirm() is modelled for now (no prompt/alert) — keep it minimal; a
 * later need can grow the shape. Never throws: the promise resolves `false` if
 * the dialog is dismissed (Esc / outside-click / cancel) and `true` only when
 * the confirm button is clicked.
 */
import { defineStore } from "pinia";
import { ref } from "vue";

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Render the confirm button in the danger colour (destructive actions). */
  danger?: boolean;
}

interface PendingConfirm extends ConfirmOptions {
  resolve: (ok: boolean) => void;
}

export const useDialogStore = defineStore("dialog", () => {
  /** The active confirm request, or `null` when no dialog is open. */
  const pending = ref<PendingConfirm | null>(null);

  /** Is a confirm dialog currently open? */
  const open = ref(false);

  /**
   * Show a confirm dialog + return a promise that resolves with the user's
   * choice. Replacing an already-open dialog resolves it with `false` first
   * (defensive — the UI only ever opens one at a time).
   */
  function confirm(options: ConfirmOptions): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      if (pending.value) pending.value.resolve(false);
      pending.value = { ...options, resolve };
      open.value = true;
    });
  }

  /** Resolve the open dialog with `ok` and close. No-op when none is open. */
  function resolveConfirm(ok: boolean): void {
    const p = pending.value;
    pending.value = null;
    open.value = false;
    if (p) p.resolve(ok);
  }

  return { pending, open, confirm, resolveConfirm };
});