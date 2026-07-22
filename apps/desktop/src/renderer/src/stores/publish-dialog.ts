/**
 * Publish-dialog store (headless) — a small form dialog for publishing (or
 * republishing) a note to the web via `db.monographs.publish`. Promise-based so
 * the caller can `await` the user's choice: resolves with a {@link PublishInput}
 * (or `null` on dismiss), which the caller forwards to the publish store's
 * `publishById(id, title, opts)`. Mirrors {@link useReminderDialogStore} /
 * {@link useColorDialogStore}: only one dialog is ever open; `confirm`/`cancel`
 * resolve the pending promise.
 *
 * Fields: `title` (prefilled from the note, editable — passed as the monograph
 * title), `password` (optional — encrypts the public page), `selfDestruct`
 * (deletes the monograph after its first view). `openCreate(noteId, noteTitle)`
 * seeds a fresh publish; `openEdit(noteId, noteTitle, current)` seeds a
 * republish from the persisted `Monograph` row's `selfDestruct` (the password
 * is never re-read — it is a one-way cipher — so the field starts empty with a
 * "leave blank to keep" hint). Never throws; `cancel`/Esc/outside-click
 * resolve `null`.
 *
 * The store holds raw form state only — {@link PublishDialog.vue} renders it.
 * `confirm` omits `password` when empty (so the returned `PublishInput` is safe
 * under `exactOptionalPropertyTypes`); an empty title after trim resolves
 * `null` (treated as a cancel, matching the reminder dialog).
 *
 * Self-hosting note: this dialog only shapes the request; the public URL comes
 * back from the server as `Monograph.publishUrl` (read via `formatPublishUrl`),
 * never constructed here — so a self-hoster's API server returns the correct
 * URL for their monograph server. See `utils/publish.ts`.
 */
import { defineStore } from "pinia";
import { ref } from "vue";

/** The user's publish choice. `password` is present only when non-empty (so the
 *  object is `exactOptionalPropertyTypes`-safe); `selfDestruct` is always
 *  present. Callers destructure `const { title, ...opts } = input;` to obtain a
 *  `{password?, selfDestruct}` bag for `publishById`. */
export interface PublishInput {
  title: string;
  password?: string;
  selfDestruct: boolean;
}

interface Pending {
  resolve: (result: PublishInput | null) => void;
}

export const usePublishDialogStore = defineStore("publishDialog", () => {
  /** Whether the dialog overlay is open. */
  const open = ref(false);
  /** `"edit"` when republishing an already-published note (button reads
   *  "Update"), else `"create"`. */
  const mode = ref<"create" | "edit">("create");
  /** The note id this publish targets (threaded through to the publish store;
   *  not a field the user edits). */
  const noteId = ref<string | null>(null);

  const title = ref("");
  const password = ref("");
  /** Whether the password field is shown in clear text. */
  const showPassword = ref(false);
  const selfDestruct = ref(false);

  /** The active request, or `null` when no dialog is open. */
  let pending: Pending | null = null;

  /** Reset all fields to create-defaults. */
  function resetCreate(noteIdValue: string | null, noteTitle: string): void {
    mode.value = "create";
    noteId.value = noteIdValue;
    title.value = noteTitle;
    password.value = "";
    showPassword.value = false;
    selfDestruct.value = false;
  }

  /** Seed all fields for a republish. The existing password is a one-way cipher
   *  on the `Monograph` row, so it is NOT re-read — the field starts empty and
   *  the component shows a "leave blank to keep the current password" hint. */
  function seedForEdit(
    noteIdValue: string,
    noteTitle: string,
    current: { selfDestruct: boolean }
  ): void {
    mode.value = "edit";
    noteId.value = noteIdValue;
    title.value = noteTitle;
    password.value = "";
    showPassword.value = false;
    selfDestruct.value = !!current.selfDestruct;
  }

  /** Open the dialog to publish a note, returning a promise that resolves with
   *  the user's choice (or `null` if dismissed). Replacing an already-open
   *  dialog resolves it with `null` first (defensive — only one is ever open). */
  function openCreate(
    noteIdValue: string,
    noteTitle: string
  ): Promise<PublishInput | null> {
    return new Promise<PublishInput | null>((resolve) => {
      if (pending) pending.resolve(null);
      resetCreate(noteIdValue, noteTitle);
      pending = { resolve };
      open.value = true;
    });
  }

  /** Open the dialog seeded for a republish (Update). Resolves with the input or
   *  `null` if dismissed. */
  function openEdit(
    noteIdValue: string,
    noteTitle: string,
    current: { selfDestruct: boolean }
  ): Promise<PublishInput | null> {
    return new Promise<PublishInput | null>((resolve) => {
      if (pending) pending.resolve(null);
      seedForEdit(noteIdValue, noteTitle, current);
      pending = { resolve };
      open.value = true;
    });
  }

  /** Build the {@link PublishInput} from the current form state. Omits
   *  `password` when empty. */
  function buildInput(): PublishInput {
    const input: PublishInput = {
      title: title.value.trim(),
      selfDestruct: selfDestruct.value
    };
    const pw = password.value;
    if (pw) input.password = pw;
    return input;
  }

  /** Confirm: resolve with the built input. Resolves `null` when the title is
   *  empty after trim — the caller treats that as a cancel. */
  function confirm(): void {
    const p = pending;
    const input = buildInput();
    pending = null;
    open.value = false;
    if (p) p.resolve(input.title ? input : null);
  }

  /** Cancel: resolve `null` + close. No-op when none is open. */
  function cancel(): void {
    const p = pending;
    pending = null;
    open.value = false;
    if (p) p.resolve(null);
  }

  return {
    open,
    mode,
    noteId,
    title,
    password,
    showPassword,
    selfDestruct,
    openCreate,
    openEdit,
    setTitle: (v: string) => void (title.value = v),
    setPassword: (v: string) => void (password.value = v),
    setShowPassword: (v: boolean) => void (showPassword.value = v),
    setSelfDestruct: (v: boolean) => void (selfDestruct.value = v),
    confirm,
    cancel
  };
});