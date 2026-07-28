// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import type { Editor } from "@tiptap/vue-3";
import {
  DEFAULT_TOOLBAR,
  EDITOR_ACTION_BY_ID,
  type ToolbarDefinition
} from "@notesnook-vue/editor-vue";
import { CURRENT_TOOLBAR_VERSION, normalizeToolbarConfig, useToolbarStore } from "@/stores/toolbar";
import { actionToRootItem, actionToMenuItems, colorSubmenuItems } from "@/utils/toolbar-menu";

// In-memory fake db.settings for the toolbar-config accessors.
const stored: { toolbarConfigDesktop?: unknown } = {};
const db = {
  settings: {
    getToolbarConfig: (platform: string) =>
      platform === "desktop" ? stored.toolbarConfigDesktop : undefined,
    setToolbarConfig: vi.fn(async (platform: string, config: unknown) => {
      if (platform === "desktop") stored.toolbarConfigDesktop = config;
      return "id";
    })
  }
};

vi.mock("@/platform/bootstrap", () => ({
  getCurrentContext: () => "local",
  getDatabase: () => db,
  bootstrap: vi.fn()
}));

// --- Fake editor for the mapper tests ---------------------------------------
// A minimal stand-in for a TipTap `Editor`: records chain commands + returns
// canned `isActive`/`getAttributes` results. Cast `as unknown as Editor`.
const CHAIN_CMDS = [
  "toggleBold", "toggleItalic", "toggleUnderline", "toggleStrike", "toggleCode",
  "toggleSubscript", "toggleSuperscript", "toggleHighlight", "setColor",
  "unsetColor", "unsetHighlight", "unsetAllMarks", "setParagraph", "setHeading",
  "setFontFamily", "unsetFontFamily", "setTextAlign", "updateAttributes",
  "setImageSize", "setEmbedAlignment", "setEmbedSize", "addRowAfter",
  "addColumnAfter", "toggleHeaderRow", "toggleHeaderColumn", "deleteTable",
  "deleteSelection", "toggleBulletList", "toggleOrderedList", "toggleTaskList",
  "toggleCodeBlock", "toggleBlockquote", "setHorizontalRule", "insertTable",
  "insertEmbed", "undo", "redo", "toggleSubscript" // (dupes harmless)
];

function fakeEditor(opts: {
  active?: Record<string, boolean>;
  attrs?: Record<string, Record<string, unknown>>;
  editable?: boolean;
} = {}): Editor {
  const calls: string[] = [];
  // A chainable stub: every known command records its name + returns the same
  // chain so `.focus().<cmd>().run()` works for any action.
  const mkChain = (): Record<string, unknown> => {
    const obj: Record<string, unknown> = { run: () => undefined };
    for (const cmd of CHAIN_CMDS) {
      obj[cmd] = (..._args: unknown[]): Record<string, unknown> => {
        calls.push(cmd);
        return obj;
      };
    }
    return obj;
  };
  const ed = {
    isEditable: opts.editable ?? true,
    isDestroyed: false,
    calls,
    isActive: (nameOrAttrs: unknown, attrs?: unknown): boolean => {
      if (typeof nameOrAttrs === "string") {
        if (attrs && typeof attrs === "object") {
          const [k, v] = Object.entries(attrs as Record<string, unknown>)[0] ?? [];
          return !!opts.active?.[`${nameOrAttrs}.${k}=${v}`];
        }
        return !!opts.active?.[nameOrAttrs as string];
      }
      if (nameOrAttrs && typeof nameOrAttrs === "object") {
        const [k, v] = Object.entries(nameOrAttrs as Record<string, unknown>)[0];
        return !!opts.active?.[`${k}=${v}`];
      }
      return false;
    },
    getAttributes: (name: string): Record<string, unknown> => opts.attrs?.[name] ?? {},
    can: () => ({ undo: () => true, redo: () => true }),
    chain: () => ({ focus: () => mkChain() }),
    storage: {} as Record<string, unknown>
  };
  return ed as unknown as Editor;
}

beforeEach(() => {
  setActivePinia(createPinia());
  stored.toolbarConfigDesktop = undefined;
  db.settings.setToolbarConfig.mockClear();
});

// --- normalizeToolbarConfig (pure) -----------------------------------------
describe("normalizeToolbarConfig", () => {
  it("returns DEFAULT_TOOLBAR for a non-array / empty / all-unknown input", () => {
    expect(normalizeToolbarConfig(null)).toBe(DEFAULT_TOOLBAR);
    expect(normalizeToolbarConfig([])).toBe(DEFAULT_TOOLBAR);
    expect(normalizeToolbarConfig([["bogus-id"]])).toBe(DEFAULT_TOOLBAR);
    expect(normalizeToolbarConfig("nope")).toBe(DEFAULT_TOOLBAR);
  });

  it("drops unknown action ids but keeps known ones", () => {
    const out = normalizeToolbarConfig([["bold", "bogus", "italic"]]);
    expect(out).toEqual([["bold", "italic"]]);
  });

  it("keeps a nested more-array of known ids and drops an all-unknown nested array", () => {
    const out = normalizeToolbarConfig([
      ["bold", ["strikethrough", "bogus", "code"], ["bogus-only"]]
    ]);
    expect(out).toEqual([["bold", ["strikethrough", "code"]]]);
  });

  it("drops an empty group (after unknown-id filtering) and falls back to default when all empty", () => {
    expect(normalizeToolbarConfig([["bogus"], ["bold"]])).toEqual([["bold"]]);
    expect(normalizeToolbarConfig([["bogus"], [["bogus"]]])).toBe(DEFAULT_TOOLBAR);
  });

  it("passes a known config through unchanged", () => {
    const cfg: ToolbarDefinition = [["bold", ["italic", "code"]], ["undo"]];
    expect(normalizeToolbarConfig(cfg)).toEqual(cfg);
  });
});

// --- toolbar store round-trip ----------------------------------------------
describe("useToolbarStore", () => {
  it("load() leaves DEFAULT_TOOLBAR when nothing is stored", async () => {
    const tb = useToolbarStore();
    await tb.load();
    expect(tb.toolbarConfig).toEqual(DEFAULT_TOOLBAR);
    expect(tb.preset).toBe("default");
  });

  it("load() applies a stored custom config after normalising", async () => {
    stored.toolbarConfigDesktop = {
      version: 2,
      preset: "custom",
      config: [["bold", "bogus"], ["italic"]]
    };
    const tb = useToolbarStore();
    await tb.load();
    expect(tb.toolbarConfig).toEqual([["bold"], ["italic"]]);
    expect(tb.preset).toBe("custom");
  });

  it("load() ignores a custom preset with a non-array config (falls back to default)", async () => {
    stored.toolbarConfigDesktop = { version: 2, preset: "custom", config: "nope" };
    const tb = useToolbarStore();
    await tb.load();
    expect(tb.toolbarConfig).toEqual(DEFAULT_TOOLBAR);
  });

  it("setConfig() updates the ref + saveNow() persists with the current version", async () => {
    const tb = useToolbarStore();
    const cfg: ToolbarDefinition = [["bold"]];
    tb.setConfig(cfg, "custom");
    expect(tb.toolbarConfig).toEqual(cfg);
    expect(tb.preset).toBe("custom");
    // setConfig schedules a debounced save; flush immediately.
    tb.saveNow();
    // saveNow fires an async flush; let it settle.
    await Promise.resolve();
    await Promise.resolve();
    expect(db.settings.setToolbarConfig).toHaveBeenCalledTimes(1);
    const [platform, written] = db.settings.setToolbarConfig.mock.calls[0];
    expect(platform).toBe("desktop");
    expect(written).toMatchObject({ version: CURRENT_TOOLBAR_VERSION, preset: "custom", config: cfg });
  });

  it("reset() restores DEFAULT_TOOLBAR + preset default and persists", async () => {
    const tb = useToolbarStore();
    tb.setConfig([["italic"]], "custom");
    tb.reset();
    expect(tb.toolbarConfig).toEqual(DEFAULT_TOOLBAR);
    expect(tb.preset).toBe("default");
    tb.saveNow();
    await Promise.resolve();
    await Promise.resolve();
    const [, written] = db.settings.setToolbarConfig.mock.calls[0];
    expect(written).toMatchObject({ preset: "default", config: DEFAULT_TOOLBAR });
  });
});

// --- toolbar-menu mapper ----------------------------------------------------
describe("toolbar-menu mapper", () => {
  it("actionToRootItem: a toggle action becomes a leaf with checked + onSelect→run", () => {
    const ed = fakeEditor({ active: { bold: true } });
    const bold = EDITOR_ACTION_BY_ID.get("bold")!;
    const item = actionToRootItem(ed, bold);
    expect(item).not.toBeNull();
    expect(item!.label).toBe("Bold");
    expect(item!.checked).toBe(true);
    expect(item!.submenu).toBeUndefined();
    // onSelect runs the action (records toggleBold via the fake chain).
    item!.onSelect!();
    expect((ed as unknown as { calls: string[] }).calls).toContain("toggleBold");
  });

  it("actionToRootItem: a dropdown action becomes a parent whose submenu lists its items", () => {
    const ed = fakeEditor({ active: { paragraph: true } });
    const headings = EDITOR_ACTION_BY_ID.get("headings")!;
    const item = actionToRootItem(ed, headings);
    expect(item!.submenu).toBeDefined();
    const built = item!.submenu!.build("");
    expect(built.map((i) => i.label)).toEqual([
      "Text",
      "Heading 1",
      "Heading 2",
      "Heading 3",
      "Heading 4",
      "Heading 5",
      "Heading 6"
    ]);
  });

  it("actionToRootItem: a conditional action is skipped when unavailable", () => {
    const ed = fakeEditor({ active: { table: false } });
    const tableSettings = EDITOR_ACTION_BY_ID.get("tableSettings")!;
    expect(actionToRootItem(ed, tableSettings)).toBeNull();
  });

  it("actionToMenuItems: a color action yields No-color + presets + Custom…", () => {
    const ed = fakeEditor();
    const textColor = EDITOR_ACTION_BY_ID.get("textColor")!;
    const items = actionToMenuItems(ed, textColor);
    const labels = items.map((i) => i.label);
    expect(labels[0]).toBe("No color");
    expect(labels).toContain("Custom…");
    // Every preset swatch carries a `color` field.
    const swatches = items.filter((i) => i.color);
    expect(swatches.length).toBeGreaterThan(0);
  });

  it("colorSubmenuItems: selecting a preset swatch calls setColor (text) / toggleHighlight (highlight)", () => {
    const ed = fakeEditor();
    const textColor = EDITOR_ACTION_BY_ID.get("textColor")!;
    const textItems = colorSubmenuItems(ed, textColor);
    const swatch = textItems.find((i) => i.color);
    swatch!.onSelect!();
    expect((ed as unknown as { calls: string[] }).calls).toContain("setColor");

    const highlight = EDITOR_ACTION_BY_ID.get("highlight")!;
    const hiItems = colorSubmenuItems(ed, highlight);
    const hiSwatch = hiItems.find((i) => i.color);
    (ed as unknown as { calls: string[] }).calls.length = 0;
    hiSwatch!.onSelect!();
    expect((ed as unknown as { calls: string[] }).calls).toContain("toggleHighlight");
  });
});