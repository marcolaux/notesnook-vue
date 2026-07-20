// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useVaultStore } from "@/stores/vault";
import type { OpenedNote } from "@/stores/vault";
import { VAULT_ERRORS } from "@notesnook-vue/contracts";

// `notes.load` spy — the store reloads the notes list after lock/unlock/delete.
const notesLoad = vi.fn(async () => {});
vi.mock("@/stores/notes", () => ({
  useNotesStore: () => ({ load: notesLoad })
}));

// In-memory fake db.vault: each method is a vi.fn controllable per-test.
// `unlocked` + `exists` are the state the store mirrors.
const state = {
  exists: false,
  unlocked: false
};

const db = {
  vault: {
    get unlocked() {
      return state.unlocked;
    },
    exists: vi.fn(async () => state.exists),
    create: vi.fn(async (_pw: string) => {
      state.exists = true;
      state.unlocked = true;
      return true;
    }),
    lock: vi.fn(async () => {
      state.unlocked = false;
      return true;
    }),
    unlock: vi.fn(async (_pw: string) => {
      state.unlocked = true;
      return true;
    }),
    changePassword: vi.fn(async (_old: string, _new: string) => {}),
    clear: vi.fn(async (_pw: string) => {}),
    delete: vi.fn(async (_deleteAllLockedNotes?: boolean) => {
      state.exists = false;
      state.unlocked = false;
    }),
    add: vi.fn(async (_noteId: string) => {}),
    remove: vi.fn(async (_noteId: string, _pw: string) => {}),
    open: vi.fn(async (_noteId: string, _pw?: string) => ({ id: "n1" }) as OpenedNote),
    save: vi.fn(async (_i: { id: string }) => "content-id-1")
  }
};

vi.mock("@/platform/bootstrap", () => ({
  getDatabase: () => db,
  bootstrap: vi.fn()
}));

describe("useVaultStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    state.exists = false;
    state.unlocked = false;
    notesLoad.mockClear();
    db.vault.exists.mockClear();
    db.vault.create.mockClear();
    db.vault.lock.mockClear();
    db.vault.unlock.mockClear();
    db.vault.changePassword.mockClear();
    db.vault.clear.mockClear();
    db.vault.delete.mockClear();
    db.vault.add.mockClear();
    db.vault.remove.mockClear();
    db.vault.open.mockClear();
    db.vault.save.mockClear();
  });

  it("starts locked + non-existent with no error", () => {
    const v = useVaultStore();
    expect(v.exists).toBe(false);
    expect(v.unlocked).toBe(false);
    expect(v.locked).toBe(true);
    expect(v.ready).toBe(false);
    expect(v.lastError).toBeNull();
    expect(v.lastErrorCode).toBeNull();
    expect(v.busy).toBe(false);
  });

  it("refresh mirrors db.vault.exists + unlocked", async () => {
    state.exists = true;
    state.unlocked = true;
    const v = useVaultStore();
    await v.refresh();
    expect(db.vault.exists).toHaveBeenCalled();
    expect(v.exists).toBe(true);
    expect(v.unlocked).toBe(true);
    expect(v.ready).toBe(true);
    expect(v.locked).toBe(false);
  });

  it("refresh never throws — leaves state intact on db error", async () => {
    state.exists = true;
    const v = useVaultStore();
    await v.refresh();
    expect(v.exists).toBe(true);
    db.vault.exists.mockRejectedValueOnce(new Error("boom"));
    await v.refresh();
    expect(v.exists).toBe(true); // unchanged
  });

  it("create succeeds → exists+unlocked true, returns true", async () => {
    const v = useVaultStore();
    const ok = await v.create("pw");
    expect(db.vault.create).toHaveBeenCalledWith("pw");
    expect(ok).toBe(true);
    expect(v.exists).toBe(true);
    expect(v.unlocked).toBe(true);
    expect(v.lastError).toBeNull();
  });

  it("create failure → error set, state unchanged, returns false", async () => {
    db.vault.create.mockRejectedValueOnce(new Error("nope"));
    const v = useVaultStore();
    const ok = await v.create("pw");
    expect(ok).toBe(false);
    expect(v.exists).toBe(false);
    expect(v.unlocked).toBe(false);
    expect(v.lastErrorCode).toBe("unknown");
    expect(v.lastError).toBeTruthy();
  });

  it("unlock succeeds → unlocked true", async () => {
    const v = useVaultStore();
    const ok = await v.unlock("pw");
    expect(db.vault.unlock).toHaveBeenCalledWith("pw");
    expect(ok).toBe(true);
    expect(v.unlocked).toBe(true);
  });

  it("unlock wrong password → lastErrorCode wrongPassword, stays locked, false", async () => {
    db.vault.unlock.mockRejectedValueOnce(new Error(VAULT_ERRORS.wrongPassword));
    const v = useVaultStore();
    const ok = await v.unlock("pw");
    expect(ok).toBe(false);
    expect(v.unlocked).toBe(false);
    expect(v.lastErrorCode).toBe("wrongPassword");
  });

  it("unlock no vault → lastErrorCode noVault", async () => {
    db.vault.unlock.mockRejectedValueOnce(new Error(VAULT_ERRORS.noVault));
    const v = useVaultStore();
    const ok = await v.unlock("pw");
    expect(ok).toBe(false);
    expect(v.lastErrorCode).toBe("noVault");
  });

  it("lock succeeds → unlocked false", async () => {
    state.unlocked = true;
    const v = useVaultStore();
    v.unlocked = true; // simulate already-unlocked
    const ok = await v.lock();
    expect(db.vault.lock).toHaveBeenCalled();
    expect(ok).toBe(true);
    expect(v.unlocked).toBe(false);
  });

  it("changePassword calls db with both args + returns true", async () => {
    const v = useVaultStore();
    const ok = await v.changePassword("old", "new");
    expect(db.vault.changePassword).toHaveBeenCalledWith("old", "new");
    expect(ok).toBe(true);
  });

  it("changePassword failure → error set, returns false", async () => {
    db.vault.changePassword.mockRejectedValueOnce(new Error(VAULT_ERRORS.wrongPassword));
    const v = useVaultStore();
    const ok = await v.changePassword("old", "new");
    expect(ok).toBe(false);
    expect(v.lastErrorCode).toBe("wrongPassword");
  });

  it("lockNote calls db.vault.add + reloads notes, returns true", async () => {
    const v = useVaultStore();
    const ok = await v.lockNote("n1");
    expect(db.vault.add).toHaveBeenCalledWith("n1");
    expect(notesLoad).toHaveBeenCalled();
    expect(ok).toBe(true);
  });

  it("lockNote vault-locked throw → lastErrorCode vaultLocked, no notes reload, false", async () => {
    db.vault.add.mockRejectedValueOnce(new Error(VAULT_ERRORS.vaultLocked));
    const v = useVaultStore();
    const ok = await v.lockNote("n1");
    expect(ok).toBe(false);
    expect(v.lastErrorCode).toBe("vaultLocked");
    expect(notesLoad).not.toHaveBeenCalled();
  });

  it("unlockNotePermanently calls db.vault.remove(id,pw) + reloads notes", async () => {
    const v = useVaultStore();
    const ok = await v.unlockNotePermanently("n1", "pw");
    expect(db.vault.remove).toHaveBeenCalledWith("n1", "pw");
    expect(notesLoad).toHaveBeenCalled();
    expect(ok).toBe(true);
  });

  it("openNote returns the note on success", async () => {
    const v = useVaultStore();
    const note = await v.openNote("n1", "pw");
    expect(db.vault.open).toHaveBeenCalledWith("n1", "pw");
    expect(note).toEqual({ id: "n1" });
    expect(v.lastError).toBeNull();
  });

  it("openNote returns undefined + sets error on failure", async () => {
    db.vault.open.mockRejectedValueOnce(new Error(VAULT_ERRORS.vaultLocked));
    const v = useVaultStore();
    const note = await v.openNote("n1");
    expect(note).toBeUndefined();
    expect(v.lastErrorCode).toBe("vaultLocked");
  });

  it("saveNote returns the content id from db.vault.save", async () => {
    const v = useVaultStore();
    const id = await v.saveNote({ id: "n1" });
    expect(db.vault.save).toHaveBeenCalledWith({ id: "n1" });
    expect(id).toBe("content-id-1");
  });

  it("saveNote failure → undefined + error set", async () => {
    db.vault.save.mockRejectedValueOnce(new Error("boom"));
    const v = useVaultStore();
    const id = await v.saveNote({ id: "n1" });
    expect(id).toBeUndefined();
    expect(v.lastErrorCode).toBe("unknown");
  });

  it("clear calls db.vault.clear(pw) + returns true", async () => {
    const v = useVaultStore();
    const ok = await v.clear("pw");
    expect(db.vault.clear).toHaveBeenCalledWith("pw");
    expect(ok).toBe(true);
  });

  it("deleteVault resets exists+unlocked + reloads notes", async () => {
    state.exists = true;
    state.unlocked = true;
    const v = useVaultStore();
    v.exists = true;
    v.unlocked = true;
    const ok = await v.deleteVault(true);
    expect(db.vault.delete).toHaveBeenCalledWith(true);
    expect(ok).toBe(true);
    expect(v.exists).toBe(false);
    expect(v.unlocked).toBe(false);
    expect(notesLoad).toHaveBeenCalled();
  });

  it("deleteVault failure → error set, state unchanged, returns false", async () => {
    db.vault.delete.mockRejectedValueOnce(new Error("boom"));
    const v = useVaultStore();
    v.exists = true;
    v.unlocked = true;
    const ok = await v.deleteVault();
    expect(ok).toBe(false);
    expect(v.exists).toBe(true);
    expect(v.unlocked).toBe(true);
    expect(v.lastErrorCode).toBe("unknown");
  });

  it("bindVaultEvents is idempotent (repeat calls don't throw)", () => {
    const v = useVaultStore();
    v.bindVaultEvents();
    v.bindVaultEvents();
    v.bindVaultEvents();
    // no throw = pass; EV pub/sub firing is covered on-site, not unit-tested
    // (EV duplicates across import graphs — see M2.6 memory gotcha).
  });

  it("a successful action clears a previous lastError", async () => {
    db.vault.unlock.mockRejectedValueOnce(new Error(VAULT_ERRORS.wrongPassword));
    const v = useVaultStore();
    await v.unlock("pw");
    expect(v.lastErrorCode).toBe("wrongPassword");
    const ok = await v.unlock("pw");
    expect(ok).toBe(true);
    expect(v.lastError).toBeNull();
    expect(v.lastErrorCode).toBeNull();
  });
});