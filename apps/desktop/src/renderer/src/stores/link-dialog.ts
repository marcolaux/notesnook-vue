/**
 * Link dialog store (headless) — a small form dialog for inserting / editing an
 * arbitrary-URL `link` mark, driven by the editor context menu's "Link…" /
 * "Edit link…" entries. Like {@link useColorDialogStore} it is promise-based so
 * the caller can `await` the user's choice, returning `{ href, text }` (or
 * `null` on dismiss); the caller then applies the mark via
 * `editor.commands.setLink` (over a selection) or inserts a text node carrying
 * the link (empty selection).
 *
 * `requireText` is set by the caller when the editor has NO selection at open
 * time — the dialog then shows + requires a "Link text" field (the link needs
 * visible text to wrap). With a selection the text field is hidden (the
 * selected text becomes the link label). Only one dialog is ever open;
 * `confirm`/`cancel` resolve the pending promise. Never throws;
 * `cancel`/Esc/outside-click resolve `null`.
 */
import { defineStore } from "pinia";
import { ref } from "vue";

export interface LinkDialogResult {
  href: string;
  text: string;
}

interface Pending {
  resolve: (result: LinkDialogResult | null) => void;
}

export const useLinkDialogStore = defineStore("linkDialog", () => {
  /** Whether the dialog overlay is open. */
  const open = ref(false);
  /** "create" (Insert link) or "edit" (Edit link) — drives the heading + confirm label. */
  const mode = ref<"create" | "edit">("create");
  /** The current URL field value. */
  const href = ref("");
  /** The current link-text field value (only used when `requireText`). */
  const text = ref("");
  /** When `true`, the link-text field is shown + required (no editor selection). */
  const requireText = ref(false);
  /** The active request, or `null` when no dialog is open. */
  let pending: Pending | null = null;

  /** Open in create mode, optionally seeding the text field with the selected
   *  text. `requireText` should be `true` when the editor has no selection. */
  function openCreate(opts?: { initialText?: string; requireText?: boolean }): Promise<LinkDialogResult | null> {
    return new Promise<LinkDialogResult | null>((resolve) => {
      if (pending) pending.resolve(null);
      mode.value = "create";
      href.value = "";
      text.value = opts?.initialText ?? "";
      requireText.value = opts?.requireText ?? false;
      pending = { resolve };
      open.value = true;
    });
  }

  /** Open in edit mode, seeded with the existing link's href (+ optional text). */
  function openEdit(initial: { href: string; text?: string; requireText?: boolean }): Promise<LinkDialogResult | null> {
    return new Promise<LinkDialogResult | null>((resolve) => {
      if (pending) pending.resolve(null);
      mode.value = "edit";
      href.value = initial.href;
      text.value = initial.text ?? "";
      requireText.value = initial.requireText ?? false;
      pending = { resolve };
      open.value = true;
    });
  }

  function setHref(next: string): void {
    href.value = next;
  }
  function setText(next: string): void {
    text.value = next;
  }

  /** Confirm: resolve with the trimmed href (+ text). Resolves `null` when the
   *  href is empty after trim, or (when `requireText`) the text is empty after
   *  trim — the caller treats that as a cancel. */
  function confirm(): void {
    const p = pending;
    const h = href.value.trim();
    const tx = text.value.trim();
    pending = null;
    open.value = false;
    if (p) {
      if (!h) {
        p.resolve(null);
        return;
      }
      if (requireText.value && !tx) {
        p.resolve(null);
        return;
      }
      p.resolve({ href: h, text: tx });
    }
  }

  /** Cancel: resolve `null` + close. No-op when none is open. */
  function cancel(): void {
    const p = pending;
    pending = null;
    open.value = false;
    if (p) p.resolve(null);
  }

  return { open, mode, href, text, requireText, openCreate, openEdit, setHref, setText, confirm, cancel };
});