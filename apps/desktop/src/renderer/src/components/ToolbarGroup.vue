<!--
  Toolbar group (Phase 5.5) — renders one group of the 2D toolbar layout: a
  list of action ids, where a nested array is the "more" split-button (rendered
  by `MoreToolsButton`). Plain ids resolve to an `EditorAction` (looked up in
  `EDITOR_ACTION_BY_ID`) and render by `kind`:

    toggle      → a glyph button that runs the action on click.
    dropdown    → a glyph button that opens a `ContextMenu` of the action's
                  `menu(editor)` items (headings / font-family / alignment).
    color       → a glyph button that opens the colour submenu (text / highlight).
    conditional → a glyph button shown ONLY when `available(editor)` is true
                  (table / image / embed settings), opening the action's menu.

  Active / disabled / hidden states are re-evaluated on every editor
  transaction via the `version` prop (bumped by the parent `EditorToolbar`'s
  transaction listener) so the buttons stay in sync with the selection. The
  dropdown / colour / conditional menus are built fresh on each open (their
  `isActive` checks run against the live selection).
-->
<script setup lang="ts">
import { computed } from "vue";
import type { Editor } from "@tiptap/vue-3";
import { EDITOR_ACTION_BY_ID, type EditorAction } from "@notesnook-vue/editor-vue";
import { Icon } from "@notesnook-vue/ui-vue";
import { useContextMenuStore } from "@/stores/context-menu";
import { actionToMenuItems } from "@/utils/toolbar-menu";
import { editorToolTitle } from "@/composables/use-editor-labels";
import MoreToolsButton from "./MoreToolsButton.vue";

const props = defineProps<{
  group: (string | string[])[];
  editor: Editor | undefined;
  /** Bumped by `EditorToolbar` on every editor transaction/update so the
   *  `items` computed re-runs and active/disabled/hidden states stay fresh. */
  version: number;
}>();

const menu = useContextMenuStore();

/** Open the action's menu anchored below the clicked button. */
function openMenu(action: EditorAction, e: MouseEvent): void {
  const ed = props.editor;
  if (!ed) return;
  const el = e.currentTarget as HTMLElement;
  const r = el.getBoundingClientRect();
  menu.show(actionToMenuItems(ed, action), Math.round(r.left), Math.round(r.bottom));
}

type RenderItem =
  | { type: "more"; ids: string[] }
  | { type: "action"; action: EditorAction; active: boolean; disabled: boolean; hidden: boolean };

/** Resolve the group's items into render descriptors, re-evaluating state on
 *  each `version` bump. Unknown ids (a stale persisted config) are dropped. */
const items = computed<RenderItem[]>(() => {
  void props.version; // touch so this re-runs on every editor transaction
  const ed = props.editor;
  const out: RenderItem[] = [];
  for (const item of props.group) {
    if (Array.isArray(item)) {
      out.push({ type: "more", ids: item });
      continue;
    }
    const action = EDITOR_ACTION_BY_ID.get(item);
    if (!action) continue;
    const hidden =
      action.kind === "conditional" && action.available && ed ? !action.available(ed) : false;
    const active = !hidden && action.isActive && ed ? action.isActive(ed) : false;
    const disabled = !ed || (action.isDisabled ? action.isDisabled(ed) : !ed.isEditable);
    out.push({ type: "action", action, active, disabled, hidden });
  }
  return out;
});

function getGlyph(action: EditorAction): string | undefined {
  const ed = props.editor;
  if (action.id === "lists") {
    if (ed?.isActive("orderedList")) return "list-ordered";
    if (ed?.isActive("taskList")) return "list-checks";
    if (ed?.isActive("outlineList")) return "list-tree";
    if (ed?.isActive("bulletList")) return "list";
  }
  return action.glyph;
}

/** A toggle action runs directly; dropdown / colour / conditional open a menu. */
function onClick(action: EditorAction, e: MouseEvent): void {
  const ed = props.editor;
  if (!ed) return;
  if (action.kind === "toggle" || action.kind === undefined) {
    action.run(ed);
  } else {
    openMenu(action, e);
  }
}
</script>

<template>
  <template v-for="(item, i) in items" :key="i">
    <MoreToolsButton
      v-if="item.type === 'more'"
      :action-ids="item.ids"
      :editor="props.editor"
    />
    <button
      v-else-if="!item.hidden"
      type="button"
      class="grid h-6 shrink-0 place-items-center rounded px-1.5 text-xs text-text-muted hover:bg-glass-hover hover:text-text disabled:opacity-40"
      :class="{ 'bg-glass-active text-text': item.active }"
      :disabled="item.disabled"
      :title="editorToolTitle(item.action)"
      @click="onClick(item.action, $event)"
    >
      <Icon v-if="getGlyph(item.action)" :name="getGlyph(item.action)!" :size="16" />
      <template v-else>{{ editorToolTitle(item.action) }}</template>
    </button>
  </template>
</template>