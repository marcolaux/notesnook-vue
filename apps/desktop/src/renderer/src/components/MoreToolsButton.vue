<!--
  "More tools" split-button (Phase 5.5) — the nested array inside a toolbar
  group renders as this button. Clicking opens a `ContextMenu` of the group's
  extra actions: each action becomes a `MenuItem` via `actionToRootItem` (a
  toggle → leaf; a dropdown / colour / conditional → a parent row with a
  submenu holding that action's items — one submenu level, the context menu's
  limit). Conditional actions whose `available` is false are skipped. Built
  fresh on each open so active states + availability reflect the live selection.

  Distinct from the trailing "⋯" in `EditorToolbar` (tooltip "Command palette")
  — this button's tooltip is "More formatting" and it sits within a group, not
  at the strip's end.
-->
<script setup lang="ts">
import type { Editor } from "@tiptap/vue-3";
import { useI18n } from "vue-i18n";
import { EDITOR_ACTION_BY_ID } from "@notesnook-vue/editor-vue";
import { Icon } from "@notesnook-vue/ui-vue";
import { useContextMenuStore } from "@/stores/context-menu";
import { actionToRootItem } from "@/utils/toolbar-menu";

const { t } = useI18n();

const props = defineProps<{
  actionIds: string[];
  editor: Editor | undefined;
}>();

const menu = useContextMenuStore();

function open(e: MouseEvent): void {
  const ed = props.editor;
  if (!ed) return;
  const el = e.currentTarget as HTMLElement;
  const r = el.getBoundingClientRect();
  const items = props.actionIds
    .map((id) => EDITOR_ACTION_BY_ID.get(id))
    .filter((a): a is NonNullable<typeof a> => !!a)
    .map((a) => actionToRootItem(ed, a))
    .filter((m): m is NonNullable<typeof m> => !!m);
  if (items.length === 0) return;
  menu.show(items, Math.round(r.left), Math.round(r.bottom));
}
</script>

<template>
  <button
    type="button"
    class="grid h-6 shrink-0 place-items-center rounded px-1.5 text-xs text-text-muted hover:bg-glass-hover hover:text-text disabled:opacity-40"
    :title="t('editorToolbar.moreFormatting')"
    :disabled="!props.editor"
    @click="open"
  >
    <Icon name="ellipsis" :size="16" />
  </button>
</template>