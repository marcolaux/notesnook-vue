<script setup lang="ts">
/*
Task list node-view — header bar (master toggle + title + progress + clear
completed) over the editable list of task items (`<NodeViewContent as="ul">`).
The `stats` attribute (kept in sync by the task-list-state-management plugin)
drives the progress bar. The header is editing-only UI — serialization uses the
node's `renderHTML` (`<ul class="checklist" data-title? data-readonly?>…`), so
the header is not persisted, only `title`/`readonly` (as data-* attrs) are.
*/
import { computed, ref, watch } from "vue";
import { NodeViewWrapper, NodeViewContent } from "@tiptap/vue-3";
import type { NodeViewProps } from "@tiptap/vue-3";
import { deleteCheckedItems } from "./utils";

const props = defineProps<NodeViewProps>();

type Stats = { checked: number; total: number };

const stats = computed<Stats>(() => {
  const s = props.node.attrs.stats as Stats | undefined;
  return { checked: s?.checked ?? 0, total: s?.total ?? 0 };
});
const readonly = computed(() => Boolean(props.node.attrs.readonly));
const allChecked = computed(() => stats.value.total > 0 && stats.value.checked === stats.value.total);
const someChecked = computed(() => stats.value.checked > 0 && !allChecked.value);
const progressPct = computed(() =>
  stats.value.total > 0 ? Math.round((stats.value.checked / stats.value.total) * 100) : 0
);

const titleModel = ref((props.node.attrs.title as string | null | undefined) ?? "");
watch(
  () => props.node.attrs.title,
  (v) => {
    titleModel.value = (v as string | null | undefined) ?? "";
  }
);

function commitTitle(): void {
  const value = titleModel.value.trim() ? titleModel.value : null;
  props.updateAttributes({ title: value });
}

/** Check (or uncheck) every direct task item in this list. */
function toggleAll(): void {
  if (readonly.value) return;
  const pos = props.getPos();
  const target = !allChecked.value;
  props.editor.commands.command(({ tr, state }) => {
    const node = state.doc.nodeAt(pos);
    if (!node) return false;
    let changed = false;
    node.forEach((child, offset) => {
      if (child.type.name === "taskItem" && Boolean(child.attrs.checked) !== target) {
        tr.setNodeMarkup(pos + 1 + offset, undefined, { ...child.attrs, checked: target });
        changed = true;
      }
    });
    return changed;
  });
}

/** Remove every checked task item (and their subtrees) from this list. */
function clearCompleted(): void {
  if (readonly.value) return;
  const pos = props.getPos();
  props.editor.commands.command(({ tr, dispatch }) => {
    const result = deleteCheckedItems(tr, pos);
    if (result && dispatch) dispatch(tr);
    return result !== null;
  });
}
</script>

<template>
  <NodeViewWrapper
    as="div"
    class="tasklist-wrapper my-2 overflow-hidden rounded-lg border border-glass-border bg-glass-surface"
  >
    <div class="flex items-center gap-2 border-b border-glass-border px-3 py-2">
      <button
        type="button"
        class="grid h-4 w-4 shrink-0 place-items-center rounded border transition-colors"
        :class="
          allChecked
            ? 'border-indigo-500 bg-indigo-500 text-white'
            : someChecked
              ? 'border-indigo-400/60 bg-indigo-400/30 text-indigo-100'
              : 'border-glass-active hover:border-text-muted'
        "
        :title="allChecked ? 'Uncheck all' : 'Check all'"
        @click.prevent="toggleAll"
        @mousedown.prevent.stop
      >
        <span v-if="allChecked" class="text-[10px] leading-none">✓</span>
        <span v-else-if="someChecked" class="text-[10px] leading-none">–</span>
      </button>
      <input
        v-model="titleModel"
        type="text"
        placeholder="Checklist title"
        class="min-w-0 flex-1 bg-transparent text-sm text-text outline-none placeholder:text-text-muted"
        @change="commitTitle"
        @blur="commitTitle"
        @mousedown.stop
      />
      <span class="shrink-0 text-xs tabular-nums text-text-muted"
        >{{ stats.checked }}/{{ stats.total }}</span
      >
      <button
        v-if="stats.checked > 0"
        type="button"
        class="shrink-0 rounded px-1.5 py-0.5 text-xs text-text-muted hover:bg-glass-hover hover:text-text"
        title="Clear completed"
        @click.prevent="clearCompleted"
        @mousedown.prevent.stop
      >
        Clear
      </button>
    </div>
    <div class="h-0.5 w-full bg-glass-border">
      <div class="h-full bg-indigo-500 transition-all" :style="{ width: progressPct + '%' }" />
    </div>
    <NodeViewContent as="ul" class="block space-y-2 px-3 py-2" />
  </NodeViewWrapper>
</template>