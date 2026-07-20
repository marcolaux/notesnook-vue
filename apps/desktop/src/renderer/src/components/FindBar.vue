<!--
  Per-tab Find & Replace bar (mounts inside `Editor.vue`, one per tab —
  KeepAlive preserves its query/state across tab switches). The match math +
  highlight decorations live in the `FindReplace` TipTap extension
  (`@notesnook-vue/editor-vue`); this component is purely the surface that
  drives the extension's commands and shows a live `index / count` readout.

  It reads match state straight from the ProseMirror plugin via
  `findReplacePluginKey.getState(editor.state)`, refreshed on every editor
  transaction (so the counter tracks typing, replace, and external edits).

  Keyboard (on the find input):
    Enter      → next      Shift+Enter → prev
    Cmd/Cmd+H  → toggle replace row   Escape → close (+ clearFind)
-->
<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from "vue";
import type { Editor } from "@tiptap/vue-3";
import { findReplacePluginKey } from "@notesnook-vue/editor-vue";

const props = defineProps<{ editor: Editor | undefined }>();
const emit = defineEmits<{ close: [] }>();

const query = ref("");
const replaceQuery = ref("");
const caseSensitive = ref(false);
const regexp = ref(false);
const showReplace = ref(false);
const count = ref(0);
const index = ref(-1);

const findInput = ref<HTMLInputElement | null>(null);

/** Re-read the plugin's live match state into local refs (for the counter). */
function refresh(): void {
  const ed = props.editor;
  if (!ed) {
    count.value = 0;
    index.value = -1;
    return;
  }
  const st = findReplacePluginKey.getState(ed.state);
  if (!st) {
    count.value = 0;
    index.value = -1;
    return;
  }
  count.value = st.matches.length;
  index.value = st.currentIndex;
}

/** Push the current query/options into the extension (recomputes matches). */
function pushQuery(): void {
  const ed = props.editor;
  if (!ed) return;
  ed.commands.setFind(query.value, {
    caseSensitive: caseSensitive.value,
    regexp: regexp.value
  });
}

function findNext(): void {
  props.editor?.commands.findNext();
}

function findPrev(): void {
  props.editor?.commands.findPrev();
}

function replace(): void {
  props.editor?.commands.replace(replaceQuery.value);
}

function replaceAll(): void {
  props.editor?.commands.replaceAll(replaceQuery.value);
}

function close(): void {
  props.editor?.commands.clearFind();
  emit("close");
}

// On open: pre-fill the query from the editor's current text selection (if it's
// a non-empty, in-doc range), then push + focus. Mirrors the browser find bar.
onMounted(() => {
  const ed = props.editor;
  if (ed) {
    const { from, to, empty } = ed.state.selection;
    if (!empty && from < to) {
      const sel = ed.state.doc.textBetween(from, to, "\n").trim();
      if (sel && !sel.includes("\n")) query.value = sel;
    }
  }
  ed?.on("transaction", refresh);
  pushQuery();
  refresh();
  void nextTick(() => findInput.value?.focus());
});

onBeforeUnmount(() => {
  props.editor?.off("transaction", refresh);
});

// Repush whenever the query or the case/regex toggles change.
watch([query, caseSensitive, regexp], pushQuery);

function onKeydown(e: KeyboardEvent): void {
  switch (e.key) {
    case "Enter":
      e.preventDefault();
      if (e.shiftKey) findPrev();
      else findNext();
      break;
    case "Escape":
      e.preventDefault();
      close();
      break;
    case "h":
    case "H":
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey) {
        // Cmd/Ctrl+H toggles the replace row (common find-and-replace binding).
        e.preventDefault();
        showReplace.value = !showReplace.value;
      }
      break;
  }
}
</script>

<template>
  <div
    class="titlebar-no-drag absolute right-3 top-2 z-20 flex w-80 flex-col gap-2 rounded-md border border-glass-border bg-glass-surface p-2 text-xs shadow-lg"
  >
    <div class="flex items-center gap-1">
      <input
        ref="findInput"
        v-model="query"
        class="min-w-0 flex-1 rounded border border-glass-border bg-glass-surface px-2 py-1 text-text placeholder:text-text-muted focus:border-glass-active focus:outline-none"
        placeholder="Find"
        @keydown="onKeydown"
      />
      <button
        class="rounded px-1.5 py-1 text-text-muted hover:bg-glass-hover hover:text-text"
        :class="{ 'bg-glass-active text-text': caseSensitive }"
        title="Match case"
        @click="caseSensitive = !caseSensitive"
      >Aa</button>
      <button
        class="rounded px-1.5 py-1 font-mono text-text-muted hover:bg-glass-hover hover:text-text"
        :class="{ 'bg-glass-active text-text': regexp }"
        title="Regular expression"
        @click="regexp = !regexp"
      >.*</button>
      <button
        class="rounded px-1.5 py-1 text-text-muted hover:bg-glass-hover hover:text-text"
        title="Toggle replace"
        @click="showReplace = !showReplace"
      >⇅</button>
      <span class="w-16 shrink-0 text-center text-text-muted">
        {{ count === 0 ? "No results" : `${index < 0 ? 0 : index + 1}/${count}` }}
      </span>
      <button
        class="rounded px-1.5 py-1 text-text-muted hover:bg-glass-hover hover:text-text disabled:opacity-30"
        title="Previous (Shift+Enter)"
        :disabled="count === 0"
        @click="findPrev"
      >↑</button>
      <button
        class="rounded px-1.5 py-1 text-text-muted hover:bg-glass-hover hover:text-text disabled:opacity-30"
        title="Next (Enter)"
        :disabled="count === 0"
        @click="findNext"
      >↓</button>
      <button
        class="rounded px-1.5 py-1 text-text-muted hover:bg-glass-hover hover:text-text"
        title="Close (Escape)"
        @click="close"
      >×</button>
    </div>
    <div v-if="showReplace" class="flex items-center gap-1">
      <input
        v-model="replaceQuery"
        class="min-w-0 flex-1 rounded border border-glass-border bg-glass-surface px-2 py-1 text-text placeholder:text-text-muted focus:border-glass-active focus:outline-none"
        placeholder="Replace"
        @keydown.escape.prevent="close"
      />
      <button
        class="rounded border border-glass-border px-2 py-1 text-text hover:bg-glass-hover disabled:opacity-30"
        :disabled="count === 0"
        title="Replace current"
        @click="replace"
      >Replace</button>
      <button
        class="rounded border border-glass-border px-2 py-1 text-text hover:bg-glass-hover disabled:opacity-30"
        :disabled="count === 0"
        title="Replace all"
        @click="replaceAll"
      >All</button>
    </div>
  </div>
</template>