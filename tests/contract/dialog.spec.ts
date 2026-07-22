// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useDialogStore } from "@/stores/dialog";

describe("useDialogStore", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("starts closed with no pending request", () => {
    const d = useDialogStore();
    expect(d.open).toBe(false);
    expect(d.pending).toBeNull();
  });

  it("confirm opens the dialog + the promise stays pending until resolved", async () => {
    const d = useDialogStore();
    let resolved: boolean | undefined;
    const p = d.confirm({ message: "Are you sure?" });
    void p.then((ok) => (resolved = ok));
    expect(d.open).toBe(true);
    expect(d.pending?.message).toBe("Are you sure?");
    // Not resolved yet.
    await Promise.resolve();
    expect(resolved).toBeUndefined();
  });

  it("resolveConfirm(true) resolves the promise + closes", async () => {
    const d = useDialogStore();
    const p = d.confirm({ message: "x" });
    d.resolveConfirm(true);
    expect(await p).toBe(true);
    expect(d.open).toBe(false);
    expect(d.pending).toBeNull();
  });

  it("resolveConfirm(false) resolves false + closes", async () => {
    const d = useDialogStore();
    const p = d.confirm({ message: "x" });
    d.resolveConfirm(false);
    expect(await p).toBe(false);
    expect(d.open).toBe(false);
  });

  it("opening a second confirm resolves the first with false", async () => {
    const d = useDialogStore();
    const p1 = d.confirm({ message: "first" });
    const p2 = d.confirm({ message: "second" });
    expect(d.pending?.message).toBe("second");
    expect(await p1).toBe(false); // first dismissed
    d.resolveConfirm(true);
    expect(await p2).toBe(true);
  });

  it("resolveConfirm is a no-op when nothing is open", () => {
    const d = useDialogStore();
    expect(() => d.resolveConfirm(true)).not.toThrow();
    expect(d.open).toBe(false);
  });
});