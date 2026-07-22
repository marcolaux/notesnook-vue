/**
 * Color-editor dialog store (headless) — a small form dialog for creating a
 * note color, driven by the note-row context menu's "New color…" entry. Like
 * {@link useDialogStore} it is promise-based so the caller can `await` the
 * user's choice, but it returns `{ title, colorCode }` (or `null` on dismiss)
 * instead of a boolean — the caller then creates the color via `db.colors.add`
 * + assigns it.
 *
 * Only one dialog is ever open; `confirm`/`cancel` resolve the pending promise.
 * The dialog seeds a default title + colorCode on `openCreate` so the picker
 * never starts empty. Never throws; `cancel`/Esc/outside-click resolve `null`.
 */
import { defineStore } from "pinia";
import { ref } from "vue";

export interface ColorDialogResult {
  title: string;
  colorCode: string;
}

interface Pending {
  resolve: (result: ColorDialogResult | null) => void;
}

export const useColorDialogStore = defineStore("colorDialog", () => {
  /** Whether the dialog overlay is open. */
  const open = ref(false);
  /** The current title field value. */
  const title = ref("");
  /** The current colorCode field value (a CSS hex string). */
  const colorCode = ref("#f44336");
  /** The active request, or `null` when no dialog is open. */
  let pending: Pending | null = null;

  /** Open the dialog seeded with a default title + color, returning a promise
   *  that resolves with the user's choice (or `null` if dismissed). Replacing
   *  an already-open dialog resolves it with `null` first (defensive — only one
   *  is ever open at a time). */
  function openCreate(): Promise<ColorDialogResult | null> {
    return new Promise<ColorDialogResult | null>((resolve) => {
      if (pending) pending.resolve(null);
      title.value = "";
      colorCode.value = "#f44336";
      pending = { resolve };
      open.value = true;
    });
  }

  /** Update the title field. */
  function setTitle(next: string): void {
    title.value = next;
  }

  /** Update the colorCode field. Normalized to lowercase so the hex input +
   *  the native picker stay in sync. */
  function setColorCode(next: string): void {
    colorCode.value = next;
  }

  /** Confirm: resolve with the trimmed fields. Rejects (resolves `null`) when
   *  the title is empty after trim — the caller treats that as a cancel. */
  function confirm(): void {
    const p = pending;
    const t = title.value.trim();
    pending = null;
    open.value = false;
    if (p) p.resolve(t ? { title: t, colorCode: colorCode.value } : null);
  }

  /** Cancel: resolve `null` + close. No-op when none is open. */
  function cancel(): void {
    const p = pending;
    pending = null;
    open.value = false;
    if (p) p.resolve(null);
  }

  return { open, title, colorCode, openCreate, setTitle, setColorCode, confirm, cancel };
});