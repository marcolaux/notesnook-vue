/**
 * Host label injection for the editor-vue tool actions (Phase 7.1 i18n).
 *
 * `packages/editor-vue` is kept free of any i18n dependency; instead it exposes
 * {@link setEditorLabelResolver}, which the host installs once at boot. The
 * resolver maps an `EditorAction.id` (e.g. `"bold"`) to a `tools.<id>` catalog
 * key. `te`/`t` read the global locale fresh on every call, so:
 *   - the slash menu (re-mounts per open) always shows the current locale;
 *   - `editorToolTitle` used in a component template re-renders on locale change
 *     (it reads the reactive `i18n.global.locale`).
 * Missing `tools.*` keys fall back to the action's English `title` (via `te`
 * returning false), so installing the resolver is inert until keys are added.
 */
import { setEditorLabelResolver } from "@notesnook-vue/editor-vue";
import i18n from "@/i18n";

let installed = false;

/** Install the host tool-label resolver. Call once at app boot (after the i18n
 *  plugin is created — `i18n.global` is available at module load). Idempotent. */
export function installEditorLabelResolver(): void {
  if (installed) return;
  installed = true;
  const { t, te } = i18n.global;
  setEditorLabelResolver((id: string): string | undefined => {
    const key = `tools.${id}`;
    return te(key) ? (t(key) as string) : undefined;
  });
}

/** Resolve a tool action's display title for use in host templates / non-component
 *  code. Reads `i18n.global` (reactive on locale). Falls back to English `title`
 *  when no `tools.<id>` key exists. */
export function editorToolTitle(action: { id: string; title: string }): string {
  const { t, te } = i18n.global;
  const key = `tools.${action.id}`;
  return te(key) ? (t(key) as string) : action.title;
}