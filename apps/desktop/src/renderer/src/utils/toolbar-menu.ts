/**
 * Toolbar → context-menu mapper (Phase 5.5). Converts editor-vue
 * {@link EditorAction}s (and their `menu(editor)` {@link ToolbarMenuItem}s)
 * into the renderer's context-menu {@link MenuItem}s so the toolbar dropdowns
 * and the "more" split-button reuse the existing `ContextMenu` overlay +
 * `useContextMenuStore` (no separate popup primitive).
 *
 * Two entry points:
 *  - {@link actionToMenuItems} — the flat `MenuItem[]` shown as the ROOT menu
 *    when a top-level toolbar dropdown / colour / conditional button is
 *    clicked (its items are the action's own menu, laid out flat).
 *  - {@link actionToRootItem} — a SINGLE `MenuItem` (or `null` to skip) for an
 *    action rendered INSIDE the "more" popup: a toggle becomes a leaf, a
 *    dropdown / colour / conditional becomes a parent row whose submenu holds
 *    the action's items (one submenu level — the context menu's limit).
 *
 * `editor-vue` MUST stay free of renderer imports, so its `ToolbarMenuItem` is
 * a structural mirror of `MenuItem`; {@link toMenuItem} casts/maps the (identical)
 * fields across, recursing into `submenu.build`.
 */
import type { Editor } from "@tiptap/vue-3";
import type { EditorAction, ToolbarMenuItem } from "@notesnook-vue/editor-vue";
import type { MenuItem, SubmenuSpec } from "@/utils/context-menu";
import { DefaultColors } from "@notesnook-vue/contracts";
import i18n from "@/i18n";
import { editorToolTitle } from "@/composables/use-editor-labels";

/**
 * Resolve an editor-vue toolbar submenu `label`. editor-vue emits i18n KEY
 * strings (`tools.submenu.*`) as the item `label` so it stays free of any i18n
 * dependency; the host resolves them here, at the editor-vue→renderer menu
 * boundary. Proper-name labels (font-family preset names like "Arial", colour
 * preset names like "Red") have no `tools.submenu.*` entry → `te` returns false
 * → the literal passes through untranslated (no vue-i18n missing-key warning).
 * Reads `i18n.global` so the resolution is reactive on locale change.
 */
function resolveLabel(label: string): string {
  const { te, t } = i18n.global;
  return te(label) ? (t(label) as string) : label;
}

/** Preset swatches from core's `DefaultColors` (name → hex), title-cased — the
 *  one-click colour entries in the text-colour / highlight submenus. */
const PRESET_COLORS = Object.entries(DefaultColors).map(([name, code]) => ({
  title: name.charAt(0).toUpperCase() + name.slice(1),
  colorCode: code
}));

/** `editor.chain().focus()` whose available commands depend on the loaded
 *  extensions; cast so this mapper stays decoupled from a specific set (same
 *  idiom as editor-vue's `tool-definitions.ts` `chain` helper). */
type Chain = {
  setColor: (code: string) => Chain;
  unsetColor: () => Chain;
  toggleHighlight: (opts: { color: string }) => Chain;
  unsetHighlight: () => Chain;
  run: () => void;
};
const chain = (editor: Editor): Chain => editor.chain().focus() as unknown as Chain;

/** Map a editor-vue {@link ToolbarMenuItem} to a renderer {@link MenuItem}
 *  (identical fields), recursing into the submenu builder. */
export function toMenuItem(t: ToolbarMenuItem): MenuItem {
  const item: MenuItem = {
    id: t.id,
    label: resolveLabel(t.label),
    ...(t.separator ? { separator: true } : {}),
    ...(t.checked !== undefined ? { checked: t.checked } : {}),
    ...(t.disabled !== undefined ? { disabled: t.disabled } : {}),
    ...(t.danger !== undefined ? { danger: t.danger } : {}),
    ...(t.color !== undefined ? { color: t.color } : {}),
    ...(t.icon !== undefined ? { icon: t.icon } : {}),
    ...(t.keepOpen !== undefined ? { keepOpen: t.keepOpen } : {}),
    ...(t.onSelect !== undefined ? { onSelect: t.onSelect } : {})
  };
  if (t.submenu) {
    const sub = t.submenu;
    const submenu: SubmenuSpec = {
      ...(sub.search ? { search: sub.search } : {}),
      build: (query: string): MenuItem[] => sub.build(query).map(toMenuItem)
    };
    item.submenu = submenu;
  }
  return item;
}

/** Map a flat list of editor-vue toolbar items → renderer menu items. */
export function mapToolbarItems(items: readonly ToolbarMenuItem[]): MenuItem[] {
  return items.map(toMenuItem);
}

/** A leaf MenuItem for a toggle action (used inside the "more" popup). */
function toggleLeaf(editor: Editor, action: EditorAction): MenuItem {
  return {
    id: action.id,
    label: editorToolTitle(action),
    ...(action.glyph !== undefined ? { icon: action.glyph } : {}),
    checked: action.isActive?.(editor) ?? false,
    disabled: action.isDisabled?.(editor) ?? !editor.isEditable,
    onSelect: () => action.run(editor)
  };
}

/**
 * The `MenuItem[]` to show as the ROOT menu when a top-level toolbar
 * dropdown / colour / conditional button is clicked. `toggle` actions are not
 * opened as menus (the toolbar runs them directly), but the helper still
 * returns a single leaf for completeness.
 */
export function actionToMenuItems(editor: Editor, action: EditorAction): MenuItem[] {
  switch (action.kind) {
    case "dropdown":
    case "conditional":
      return action.menu ? mapToolbarItems(action.menu(editor)) : [];
    case "color":
      return colorSubmenuItems(editor, action);
    case "toggle":
    default:
      return [toggleLeaf(editor, action)];
  }
}

/**
 * A single `MenuItem` for an action rendered INSIDE the "more" popup, or `null`
 * to skip it (a conditional action whose `available` is false). A toggle is a
 * leaf; dropdown / colour / conditional become a parent row whose submenu holds
 * the action's items.
 */
export function actionToRootItem(editor: Editor, action: EditorAction): MenuItem | null {
  if (action.kind === "conditional" && action.available && !action.available(editor)) {
    return null;
  }
  // `kind` defaults to `"toggle"` (undefined) — treat both as a leaf.
  if (action.kind === "toggle" || action.kind === undefined) return toggleLeaf(editor, action);

  const build = (): MenuItem[] => {
    if (action.kind === "color") return colorSubmenuItems(editor, action);
    return action.menu ? mapToolbarItems(action.menu(editor)) : [];
  };
  return {
    id: action.id,
    label: editorToolTitle(action),
    ...(action.glyph !== undefined ? { icon: action.glyph } : {}),
    submenu: { build: () => build() }
  };
}

/** The colour submenu for a `kind:"color"` action: an "Unset" entry (checked
 *  when no colour is active), the preset swatches (checked when one is active),
 *  then "Custom…" which opens the host colour picker (`editor.storage.
 *  openEditorColorPicker`, wired in `color-bridge.ts`). */
export function colorSubmenuItems(editor: Editor, action: EditorAction): MenuItem[] {
  const target = action.colorTarget ?? "text";
  const active =
    target === "highlight"
      ? (editor.getAttributes("highlight").color as string | undefined)
      : (editor.getAttributes("textStyle").color as string | undefined);
  const unset = (): void => {
    if (target === "highlight") chain(editor).unsetHighlight().run();
    else chain(editor).unsetColor().run();
  };
  const apply = (code: string): void => {
    if (target === "highlight") chain(editor).toggleHighlight({ color: code }).run();
    else chain(editor).setColor(code).run();
  };
  const items: MenuItem[] = [
    {
      id: `color-unset-${target}`,
      label: resolveLabel(target === "highlight" ? "tools.submenu.noHighlight" : "tools.submenu.noColor"),
      checked: !active,
      onSelect: unset
    }
  ];
  if (PRESET_COLORS.length > 0) {
    items.push({ id: `color-preset-sep-${target}`, label: "", separator: true });
    for (const p of PRESET_COLORS) {
      items.push({
        id: `color-${target}-${p.colorCode}`,
        label: p.title,
        color: p.colorCode,
        checked: !!active && active.toLowerCase() === p.colorCode.toLowerCase(),
        onSelect: () => apply(p.colorCode)
      });
    }
  }
  items.push({ id: `color-custom-sep-${target}`, label: "", separator: true });
  items.push({
    id: `color-custom-${target}`,
    label: resolveLabel("tools.submenu.customColor"),
    onSelect: () => {
      (
        editor.storage as {
          openEditorColorPicker?: (t: "text" | "highlight") => void;
        }
      ).openEditorColorPicker?.(target);
    }
  });
  return items;
}