<!--
  Part of the Notesnook Vue port (packages/editor-vue). The table node-view.
  Replaces @notesnook/editor's React TableComponent. Owns the <table> +
  <colgroup>; the <tbody> is the ProseMirror contentDOM (via NodeViewContent
  as="tbody") so ProseMirror owns the rows. The column-resize handles and
  selectedCell decorations come from the vendored columnResizing/tableEditing
  plugins (installed in table.ts) and are applied by ProseMirror on the cells.

  `updateColumnsOnResize` (vendored) syncs the <col> widths from the first
  row's cell attrs — on mount, on node change (watch), and live during drag
  (called by the plugin's displayColumnWidth). `cellMinWidth` is read from the
  Table extension options so it matches what columnResizing uses.
-->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { NodeViewWrapper, NodeViewContent, type NodeViewProps } from "@tiptap/vue-3";
import { updateColumnsOnResize } from "./prosemirror-tables/tableview";
import TableRowToolbar from "./components/TableRowToolbar.vue";
import TableColumnToolbar from "./components/TableColumnToolbar.vue";
import type { TableOptions } from "./table";

const props = defineProps<NodeViewProps>();

const tableRef = ref<HTMLTableElement | null>(null);
const colgroupRef = ref<HTMLTableColElement | null>(null);
const wrapperRef = ref<HTMLElement | null>(null);

const cellMinWidth = computed(() => {
  const ext = props.editor.extensionManager.extensions.find((e) => e.name === "table");
  return (ext?.options as TableOptions | undefined)?.cellMinWidth ?? 25;
});

function syncCols() {
  if (tableRef.value && colgroupRef.value) {
    updateColumnsOnResize(
      props.node,
      colgroupRef.value,
      tableRef.value,
      cellMinWidth.value
    );
  }
}

onMounted(syncCols);
watch(() => props.node, syncCols);
watch(cellMinWidth, syncCols);
</script>

<template>
  <NodeViewWrapper as="div" class="table-node">
    <div ref="wrapperRef" class="table-node-inner">
      <template v-if="editor.isEditable">
        <TableRowToolbar :editor="editor" :wrapper="wrapperRef" />
        <TableColumnToolbar :editor="editor" :wrapper="wrapperRef" />
      </template>
      <div class="scroll-bar">
        <table ref="tableRef">
          <colgroup ref="colgroupRef" />
          <NodeViewContent as="tbody" />
        </table>
      </div>
    </div>
  </NodeViewWrapper>
</template>