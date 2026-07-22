// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useColorDialogStore } from "@/stores/color-dialog";

describe("useColorDialogStore", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("starts closed with seeded defaults", () => {
    const d = useColorDialogStore();
    expect(d.open).toBe(false);
    expect(d.title).toBe("");
    expect(d.colorCode).toBe("#f44336");
  });

  it("openCreate opens the dialog seeded with an empty title + default color", async () => {
    const d = useColorDialogStore();
    const p = d.openCreate();
    expect(d.open).toBe(true);
    expect(d.title).toBe("");
    expect(d.colorCode).toBe("#f44336");
    d.confirm();
    expect(await p).toBeNull(); // empty title → resolves null
  });

  it("confirm resolves {title,colorCode} when the title is non-empty", async () => {
    const d = useColorDialogStore();
    const p = d.openCreate();
    d.setTitle("Urgent");
    d.setColorCode("#aabbcc");
    d.confirm();
    expect(await p).toEqual({ title: "Urgent", colorCode: "#aabbcc" });
    expect(d.open).toBe(false);
  });

  it("confirm trims the title + resolves null when empty after trim", async () => {
    const d = useColorDialogStore();
    const p = d.openCreate();
    d.setTitle("   ");
    d.confirm();
    expect(await p).toBeNull();
  });

  it("cancel resolves null + closes", async () => {
    const d = useColorDialogStore();
    const p = d.openCreate();
    d.setTitle("Whatever");
    d.cancel();
    expect(await p).toBeNull();
    expect(d.open).toBe(false);
  });

  it("opening a new dialog while one is open resolves the prior with null", async () => {
    const d = useColorDialogStore();
    const first = d.openCreate();
    const second = d.openCreate();
    expect(await first).toBeNull();
    d.setTitle("New");
    d.confirm();
    expect(await second).toEqual({ title: "New", colorCode: "#f44336" });
  });
});