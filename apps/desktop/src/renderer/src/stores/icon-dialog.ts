/**
 * Icon-picker dialog store (headless) — a small picker for choosing a
 * notebook's Lucide icon, driven by the notebook context menu's "Set icon…"
 * entry. Like {@link useColorDialogStore} it is promise-based so the caller can
 * `await` the user's choice, returning `{ icon }` (a kebab Lucide name) or
 * `null` on dismiss (cancel / Esc / outside-click / "Remove").
 *
 * Only one dialog is ever open; `confirm`/`cancel` resolve the pending promise.
 * `openPicker(currentIcon?)` seeds the highlight with the notebook's existing
 * icon (or none). Never throws; `cancel`/Esc/outside-click resolve `null`.
 */
import { defineStore } from "pinia";
import { ref } from "vue";

export interface IconDialogResult {
  /** A kebab Lucide icon name from the `ICONS` registry. */
  icon: string;
}

interface Pending {
  resolve: (result: IconDialogResult | null) => void;
}

export const useIconDialogStore = defineStore("iconDialog", () => {
  /** Whether the dialog overlay is open. */
  const open = ref(false);
  /** The currently-highlighted icon name, or `null` (= "remove / no icon"). */
  const selected = ref<string | null>(null);
  /** The icon the caller passed in (shown as the starting highlight). */
  const current = ref<string | null>(null);
  /** The active request, or `null` when no dialog is open. */
  let pending: Pending | null = null;

  /** Open the picker seeded with the notebook's current icon (or none),
   *  returning a promise that resolves with the choice (or `null` if
   *  dismissed). Replacing an already-open dialog resolves it `null` first
   *  (defensive — only one is ever open at a time). */
  function openPicker(currentIcon?: string | null): Promise<IconDialogResult | null> {
    return new Promise<IconDialogResult | null>((resolve) => {
      if (pending) pending.resolve(null);
      current.value = currentIcon ?? null;
      selected.value = currentIcon ?? null;
      pending = { resolve };
      open.value = true;
    });
  }

  /** Move the highlight to an icon name. */
  function select(name: string): void {
    selected.value = name;
  }

  /** Confirm: resolve with the highlighted icon, or `null` if "Remove" (no
   *  icon is selected) — the caller treats `null` as a cancel/remove. */
  function confirm(): void {
    const p = pending;
    const choice = selected.value;
    pending = null;
    open.value = false;
    if (p) p.resolve(choice ? { icon: choice } : null);
  }

  /** Cancel: resolve `null` + close. No-op when none is open. */
  function cancel(): void {
    const p = pending;
    pending = null;
    open.value = false;
    if (p) p.resolve(null);
  }

  return { open, selected, current, openPicker, select, confirm, cancel };
});