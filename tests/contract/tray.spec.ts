// @vitest-environment node
import { describe, it, expect } from "vitest";
import { buildTrayMenuSpec, type TrayActionId } from "@contracts/tray";

describe("buildTrayMenuSpec", () => {
  const spec = buildTrayMenuSpec();

  it("has the roadmap order: New Note, New Notebook, separator, Show, Quit", () => {
    expect(spec.map((i) => i.id ?? "|")).toEqual<(TrayActionId | "|")[]>([
      "new-note",
      "new-notebook",
      "|",
      "show",
      "quit"
    ]);
  });

  it("places a single separator between the create actions and the window actions", () => {
    const seps = spec.filter((i) => i.separator);
    expect(seps).toHaveLength(1);
    expect(seps[0]).toEqual({ separator: true });
  });

  it("every non-separator item has an id + label", () => {
    for (const item of spec) {
      if (item.separator) continue;
      expect(item.id).toBeDefined();
      expect(item.label).toBeTruthy();
    }
  });

  it("ids are unique and from the TrayActionId set", () => {
    const ids = spec.map((i) => i.id).filter((i): i is TrayActionId => i !== undefined);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(["new-note", "new-notebook", "show", "quit"]).toContain(id);
    }
  });

  it("labels are i18n keys (the main process resolves them via tMain)", () => {
    const byId = Object.fromEntries(
      spec.filter((i) => i.id).map((i) => [i.id, i.label])
    );
    expect(byId["new-note"]).toBe("tray.newNote");
    expect(byId["new-notebook"]).toBe("tray.newNotebook");
    expect(byId["show"]).toBe("tray.show");
    expect(byId["quit"]).toBe("tray.quit");
  });

  it("is referentially stable per call (fresh array, same shape)", () => {
    const a = buildTrayMenuSpec();
    const b = buildTrayMenuSpec();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});