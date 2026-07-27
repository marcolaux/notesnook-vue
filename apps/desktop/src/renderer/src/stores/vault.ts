import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { EV, EVENTS } from "@notesnook-vue/contracts";
import { getDatabase } from "@/platform/bootstrap";
import { useNotesStore } from "@/stores/notes";
import type { Note, NoteContent } from "@notesnook-vue/contracts";
import {
  classifyVaultError,
  VAULT_ERROR_MESSAGES,
  type VaultErrorCode
} from "@/utils/vault";
import { logger } from "@/utils/logger";

/**
 * Vault store (Phase 6.3 — headless data backend) — the reactive surface for
 * `@notesnook/core`'s `Vault` API (`db.vault`): create / unlock / lock the
 * vault, lock a note into the vault, temporarily open a locked note, permanently
 * remove a note from the vault, change password, clear, and delete the vault.
 * Backs the future Vault UI (on-site): create/unlock dialog, lock-note action,
 * locked-note viewer.
 *
 * Design (mirrors `stores/trash.ts` + `stores/status.ts`):
 *  - **Never throws.** Every action catches, classifies the error via
 *    {@link classifyVaultError}, sets `lastError`/`lastErrorCode`, logs, and
 *    leaves the prior state intact. Mutating actions return `boolean` success;
 *    `openNote` returns the note (or `undefined`) and `saveNote` returns the
 *    saved content id (or `undefined`) — the two data-returning actions.
 *  - **Auto-lock aware.** Upstream's `Vault` erases its in-memory password after
 *    a timeout and publishes `EVENTS.vaultAutoLocked`. {@link bindVaultEvents}
 *    subscribes once (idempotent) so the `unlocked` ref stays truthful even on
 *    an external/auto lock — same form as `status.bindSyncEvents`.
 *  - **Notes list refresh.** Locking / permanently unlocking / deleting the
 *    vault changes which notes appear in "All Notes", so those actions call
 *    `useNotesStore().load()` after success (one-way dep — `notes` does not
 *    import `vault`; same pattern as `properties.ts`).
 *
 * The vault password is **never persisted** here — upstream keeps it in-memory
 * only and erases it on lock. OS-keychain caching via `platform/key-store.ts`
 * (M6 safeStorage) is an on-site UX follow-up, not part of this store.
 */

/** A note temporarily unlocked via `db.vault.open` (content included). */
export type OpenedNote = Note & { content?: NoteContent<false> };

/** Input to `db.vault.save` / {@link saveNote}. */
export interface SaveNoteInput {
  id: string;
  content?: NoteContent<false>;
  sessionId?: string;
}

export const useVaultStore = defineStore("vault", () => {
  const exists = ref(false);
  const unlocked = ref(false);
  const busy = ref(false);
  const lastError = ref<string | null>(null);
  const lastErrorCode = ref<VaultErrorCode | null>(null);

  const locked = computed(() => !unlocked.value);
  const ready = computed(() => exists.value && unlocked.value);

  function clearError(): void {
    lastError.value = null;
    lastErrorCode.value = null;
  }

  /** Record a thrown error as the last vault error. */
  function recordError(e: unknown): void {
    const code = classifyVaultError(e);
    lastErrorCode.value = code;
    lastError.value = VAULT_ERROR_MESSAGES[code];
  }

  /** Read vault existence + lock state from the database. Never throws — a
   * failure leaves the previous state intact. */
  async function refresh(): Promise<void> {
    try {
      const db = getDatabase();
      exists.value = await db.vault.exists();
      unlocked.value = db.vault.unlocked;
    } catch (e) {
      // eslint-disable-next-line no-console
      logger.error("[vault] refresh failed:", e);
    }
  }

  /** Create the vault with a password. On success the vault is unlocked. */
  async function create(password: string): Promise<boolean> {
    clearError();
    busy.value = true;
    try {
      const db = getDatabase();
      await db.vault.create(password);
      exists.value = true;
      unlocked.value = true;
      return true;
    } catch (e) {
      recordError(e);
      // eslint-disable-next-line no-console
      logger.error("[vault] create failed:", e);
      return false;
    } finally {
      busy.value = false;
    }
  }

  /** Unlock the vault with its password. */
  async function unlock(password: string): Promise<boolean> {
    clearError();
    busy.value = true;
    try {
      const db = getDatabase();
      await db.vault.unlock(password);
      unlocked.value = true;
      return true;
    } catch (e) {
      recordError(e);
      // eslint-disable-next-line no-console
      logger.error("[vault] unlock failed:", e);
      return false;
    } finally {
      busy.value = false;
    }
  }

  /** Lock the vault (erases the in-memory password upstream). */
  async function lock(): Promise<boolean> {
    clearError();
    busy.value = true;
    try {
      const db = getDatabase();
      await db.vault.lock();
      unlocked.value = false;
      return true;
    } catch (e) {
      recordError(e);
      // eslint-disable-next-line no-console
      logger.error("[vault] lock failed:", e);
      return false;
    } finally {
      busy.value = false;
    }
  }

  /** Change the vault password (requires the vault to be unlocked). */
  async function changePassword(
    oldPassword: string,
    newPassword: string
  ): Promise<boolean> {
    clearError();
    busy.value = true;
    try {
      const db = getDatabase();
      await db.vault.changePassword(oldPassword, newPassword);
      return true;
    } catch (e) {
      recordError(e);
      // eslint-disable-next-line no-console
      logger.error("[vault] changePassword failed:", e);
      return false;
    } finally {
      busy.value = false;
    }
  }

  /** Lock a note into the vault (requires the vault to be unlocked). Reloads
   * the notes list so the note drops out of "All Notes". */
  async function lockNote(noteId: string): Promise<boolean> {
    clearError();
    busy.value = true;
    try {
      const db = getDatabase();
      await db.vault.add(noteId);
      await useNotesStore().load();
      return true;
    } catch (e) {
      recordError(e);
      // eslint-disable-next-line no-console
      logger.error("[vault] lockNote failed:", e);
      return false;
    } finally {
      busy.value = false;
    }
  }

  /** Permanently remove a note from the vault (unlocks it back into All Notes).
   * Requires the vault password. Reloads the notes list. */
  async function unlockNotePermanently(
    noteId: string,
    password: string
  ): Promise<boolean> {
    clearError();
    busy.value = true;
    try {
      const db = getDatabase();
      await db.vault.remove(noteId, password);
      await useNotesStore().load();
      return true;
    } catch (e) {
      recordError(e);
      // eslint-disable-next-line no-console
      logger.error("[vault] unlockNotePermanently failed:", e);
      return false;
    } finally {
      busy.value = false;
    }
  }

  /** Temporarily open a locked note for viewing/editing. Returns the note
   * (with decrypted content) on success, `undefined` on failure (error set).
   * Data-returning — not a boolean like the mutators. */
  async function openNote(
    noteId: string,
    password?: string
  ): Promise<OpenedNote | undefined> {
    clearError();
    busy.value = true;
    try {
      const db = getDatabase();
      return (await db.vault.open(noteId, password)) as OpenedNote | undefined;
    } catch (e) {
      recordError(e);
      // eslint-disable-next-line no-console
      logger.error("[vault] openNote failed:", e);
      return undefined;
    } finally {
      busy.value = false;
    }
  }

  /** Save a note's content inside the vault. Returns the saved content id, or
   * `undefined` on failure (error set). Data-returning. */
  async function saveNote(input: SaveNoteInput): Promise<string | undefined> {
    clearError();
    busy.value = true;
    try {
      const db = getDatabase();
      return await db.vault.save(input);
    } catch (e) {
      recordError(e);
      // eslint-disable-next-line no-console
      logger.error("[vault] saveNote failed:", e);
      return undefined;
    } finally {
      busy.value = false;
    }
  }

  /** Clear the vault's locked-note content (requires the password). */
  async function clear(password: string): Promise<boolean> {
    clearError();
    busy.value = true;
    try {
      const db = getDatabase();
      await db.vault.clear(password);
      return true;
    } catch (e) {
      recordError(e);
      // eslint-disable-next-line no-console
      logger.error("[vault] clear failed:", e);
      return false;
    } finally {
      busy.value = false;
    }
  }

  /** Delete the vault entirely. `deleteAllLockedNotes` controls whether locked
   * notes are removed too. Resets existence/lock state + reloads notes. */
  async function deleteVault(deleteAllLockedNotes?: boolean): Promise<boolean> {
    clearError();
    busy.value = true;
    try {
      const db = getDatabase();
      await db.vault.delete(deleteAllLockedNotes);
      exists.value = false;
      unlocked.value = false;
      await useNotesStore().load();
      return true;
    } catch (e) {
      recordError(e);
      // eslint-disable-next-line no-console
      logger.error("[vault] deleteVault failed:", e);
      return false;
    } finally {
      busy.value = false;
    }
  }

  let bound = false;
  /** Subscribe to `@notesnook/core`'s vault lock/unlock events once so the
   * `unlocked` ref stays truthful on an external or auto lock. Idempotent —
   * safe to call from `App.vue` boot. No unsubscribe (process-lifetime). */
  function bindVaultEvents(): void {
    if (bound) return;
    bound = true;
    EV.subscribe(EVENTS.vaultLocked, () => {
      unlocked.value = false;
    });
    EV.subscribe(EVENTS.vaultAutoLocked, () => {
      unlocked.value = false;
    });
    EV.subscribe(EVENTS.vaultUnlocked, () => {
      unlocked.value = true;
    });
  }

  return {
    exists,
    unlocked,
    busy,
    lastError,
    lastErrorCode,
    locked,
    ready,
    refresh,
    create,
    unlock,
    lock,
    changePassword,
    lockNote,
    unlockNotePermanently,
    openNote,
    saveNote,
    clear,
    deleteVault,
    bindVaultEvents
  };
});