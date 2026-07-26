// @vitest-environment happy-dom
/**
 * Contract tests for the icon registry
 * (`packages/ui-vue/src/components/icon-registry.ts` + the lazy
 * `icon-registry-full.ts`).
 *
 * The registry is two layers: a static curated set (~48 icons, tree-shaken into
 * the main bundle) + a lazy full Lucide set (~580 icons, fetched on demand via
 * `loadAllIcons()` into a separate chunk). These tests pin the contract:
 *   - the curated names resolve from the static set alone (no lazy load needed)
 *     so existing `<Icon name=…>` call sites work at first paint;
 *   - `loadAllIcons()` populates the full set and `getIcon` then resolves icons
 *     outside the curated set (the new capability) — the point of the change;
 *   - the full set is large (the whole Lucide set, not a hand-picked subset);
 *   - unknown names resolve to `undefined` (the fail-safe `Icon.vue` relies on);
 *   - the alias forms are not exposed as keys.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { ICONS, getIcon, loadAllIcons, fullIcons } from "@notesnook-vue/ui-vue";

describe("icon registry (static curated set)", () => {
  it("exposes the curated set immediately (no lazy load needed)", () => {
    // The static set has the ~48 chrome icons; the full set is not loaded yet
    // in the test environment until loadAllIcons() is called.
    expect(Object.keys(ICONS).length).toBeGreaterThan(40);
    expect(fullIcons.value).toBeNull();
  });

  it("resolves the curated names from the static set alone", () => {
    const curated = [
      "book", "hash", "star", "pin", "x", "plus", "check", "ellipsis", "search",
      "list", "list-ordered", "list-checks", "list-tree", "file-text", "file", "file-code-2",
      "image", "video", "audio-lines", "film", "table-2", "quote", "minus",
      "bold", "italic", "underline", "strikethrough", "code", "subscript",
      "superscript", "highlighter", "type", "remove-formatting", "undo-2",
      "redo-2", "heading", "case-sensitive", "align-left", "align-center",
      "align-right", "align-justify", "loader-circle", "trash-2", "external-link",
      "bell", "panel-left", "panel-right", "chevron-right", "chevron-up",
      "chevron-down", "arrow-up", "arrow-down", "arrow-up-down",
      "history", "lock", "rotate-ccw"
    ];
    for (const name of curated) {
      expect(getIcon(name), `expected curated icon "${name}" to resolve`).toBeDefined();
    }
  });

  it("resolves unknown names to undefined (fail-safe for Icon.vue v-if)", () => {
    expect(getIcon("this-is-not-a-real-lucide-icon")).toBeUndefined();
    expect(getIcon("")).toBeUndefined();
  });
});

describe("icon registry (lazy full Lucide set)", () => {
  beforeEach(async () => {
    await loadAllIcons();
  });

  it("loadAllIcons populates the full set (> 500 icons)", () => {
    expect(fullIcons.value).not.toBeNull();
    expect(Object.keys(fullIcons.value ?? {}).length).toBeGreaterThan(500);
  });

  it("exposes icons that are NOT in the curated set (the new capability)", () => {
    for (const name of ["folder", "bookmark", "lightbulb", "lock", "globe", "heart"]) {
      expect(getIcon(name), `expected "${name}" to be available after loadAllIcons`).toBeDefined();
    }
  });

  it("still resolves the curated names after the full set loads", () => {
    expect(getIcon("book")).toBeDefined();
    expect(getIcon("trash-2")).toBeDefined();
  });

  it("does not leak the alias forms (…Icon suffix / Lucide… prefix) as keys", () => {
    expect(getIcon("book-icon")).toBeUndefined();
    expect(getIcon("lucide-book")).toBeUndefined();
  });

  it("loadAllIcons is idempotent (second call resolves without re-fetching)", async () => {
    const before = fullIcons.value;
    await loadAllIcons();
    expect(fullIcons.value).toBe(before);
  });
});