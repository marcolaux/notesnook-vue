/**
 * Editor commands (Phase 2.5) — one palette command per vendored editor
 * action in `@notesnook-vue/editor-vue`'s `EDITOR_ACTIONS`. Each delegates to
 * the action's `run` (which calls `editor.chain()...run()`); visibility is
 * gated on an editor being present. The slash-command menu reuses the same
 * action set directly (editor-vue owns that path), so this is the palette's
 * view of the same editor-action semantics.
 */
import { registerCommands } from "./registry";
import type { Command } from "./registry";
import { EDITOR_ACTIONS } from "@notesnook-vue/editor-vue";

const editorCommands: Command[] = EDITOR_ACTIONS.map((action) => ({
  id: `editor:${action.id}`,
  title: action.title,
  // `exactOptionalPropertyTypes` forbids assigning `undefined` to an optional
  // prop, so spread `keywords` only when present.
  ...(action.keywords ? { keywords: action.keywords } : {}),
  group: "editor" as const,
  when: (ctx) => !!ctx.editor,
  run: (ctx) => {
    if (ctx.editor) action.run(ctx.editor);
  }
}));

registerCommands(editorCommands);