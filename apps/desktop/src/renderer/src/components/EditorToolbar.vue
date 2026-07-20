<script setup lang="ts">
/**
 * Editor toolbar (Phase 5.3) — the formatting + utility strip below the editor
 * tab bar. Data-driven from `EDITOR_ACTIONS` (the same action set the command
 * palette + slash menu use), so every loaded styling option is one button;
 * adding an extension + its `EditorAction` automatically adds its button here.
 *
 * Button groups (in `EDITOR_ACTIONS` order, with separators):
 *  - History: undo/redo (disabled via `editor.can()`).
 *  - Inline marks: bold/italic/underline/strikethrough/code/highlight.
 *  - Headings + paragraph: H1/H2/H3/¶.
 *  - Lists: bullet/numbered/task.
 *  - Blocks: blockquote/code block/horizontal rule.
 *  - Inserts: image/table/embed.
 *  - Utility (not editor actions): search (`notes.focusSearch`), ToC + properties
 *    panel toggles (`useShellStore`), and ⋯ → command palette ("rest over command
 *    palette").
 *
 * Active state is per-action via `editor.isActive(...)` (note the custom
 * `CodeBlock` node is named `"codeblock"`, lowercase), re-evaluated on every
 * editor `transaction`/`update` via the `editorVersion` tick. Theme tokens
 * (`bg-glass-*`/`text-text*`/`border-glass-border`) follow the app theme.
 *
 * Not yet covered (upstream supports, but the extension isn't loaded here):
 * link / text-color / font-family / math. Loading those extensions + adding
 * their `EditorAction` makes their buttons appear here automatically; link +
 * text-color additionally need picker UIs (deferred). Underline + highlight
 * landed in Phase 5.3 (plain toggles).
 */
import { ref, watch, onBeforeUnmount, computed } from "vue";
import type { Editor } from "@tiptap/vue-3";
import { EDITOR_ACTIONS, type EditorAction } from "@notesnook-vue/editor-vue";
import { useShellStore } from "@/stores/shell";
import { useNotesStore } from "@/stores/notes";
import { useCommandPaletteStore } from "@/stores/command-palette";

const props = defineProps<{
  editor: Editor | undefined;
  /** Autosave state from the Editor (drives the "Saving…/Saved" indicator). */
  saving?: boolean;
  savedAt?: number | null;
}>();

const shell = useShellStore();
const notes = useNotesStore();
const palette = useCommandPaletteStore();

// Bumped on every editor transaction/update so the `buttons` computed re-runs
// and active/disabled states stay fresh.
const editorVersion = ref(0);
const canUndo = ref(false);
const canRedo = ref(false);

function refresh(): void {
  const e = props.editor;
  editorVersion.value++;
  canUndo.value = e ? e.can().undo() : false;
  canRedo.value = e ? e.can().redo() : false;
}

/** Compact glyph per action id (fallback: the action title). */
const GLYPHS: Record<string, string> = {
  undo: "↶",
  redo: "↷",
  bold: "B",
  italic: "I",
  underline: "U",
  strikethrough: "S",
  code: "</>",
  highlight: "🖍",
  "headings-1": "H1",
  "headings-2": "H2",
  "headings-3": "H3",
  paragraph: "¶",
  bulletList: "•",
  numberedList: "1.",
  checkList: "☑",
  blockquote: "❝",
  codeBlock: "```",
  horizontalRule: "―",
  image: "🖼",
  table: "⊞",
  embed: "🎬"
};

/** First action of each group → render a separator before it. */
const GROUP_STARTS = new Set(["bold", "headings-1", "bulletList", "blockquote", "image"]);

function isActive(action: EditorAction): boolean {
  const e = props.editor;
  if (!e) return false;
  switch (action.id) {
    case "bold":
      return e.isActive("bold");
    case "italic":
      return e.isActive("italic");
    case "underline":
      return e.isActive("underline");
    case "strikethrough":
      return e.isActive("strike");
    case "code":
      return e.isActive("code");
    case "highlight":
      return e.isActive("highlight");
    case "headings-1":
      return e.isActive("heading", { level: 1 });
    case "headings-2":
      return e.isActive("heading", { level: 2 });
    case "headings-3":
      return e.isActive("heading", { level: 3 });
    case "paragraph":
      return e.isActive("paragraph");
    case "bulletList":
      return e.isActive("bulletList");
    case "numberedList":
      return e.isActive("orderedList");
    case "checkList":
      return e.isActive("taskList");
    case "codeBlock":
      return e.isActive("codeblock"); // custom node, lowercase name
    case "blockquote":
      return e.isActive("blockquote");
    default:
      return false; // inserts (image/table/embed/hr) — no toggle active state
  }
}

function isDisabled(action: EditorAction): boolean {
  const e = props.editor;
  if (!e) return true;
  if (action.id === "undo") return !canUndo.value;
  if (action.id === "redo") return !canRedo.value;
  return !e.isEditable;
}

function runAction(action: EditorAction): void {
  const e = props.editor;
  if (e) action.run(e);
}

const buttons = computed(() => {
  // Touch `editorVersion` so this re-runs on every editor transaction (active
  // states call `editor.isActive`, which is a plain method, not reactive).
  void editorVersion.value;
  return EDITOR_ACTIONS.map((action) => ({
    action,
    glyph: GLYPHS[action.id] ?? action.title,
    active: isActive(action),
    disabled: isDisabled(action),
    sepBefore: GROUP_STARTS.has(action.id)
  }));
});

// Re-attach the transaction/update listeners when the editor instance changes
// (create/destroy — the Editor is keyed by note id) and clean up the previous.
watch(
  () => props.editor,
  (e, prev) => {
    if (prev) {
      prev.off("transaction", refresh);
      prev.off("update", refresh);
    }
    if (e) {
      e.on("transaction", refresh);
      e.on("update", refresh);
      refresh();
    } else {
      canUndo.value = false;
      canRedo.value = false;
    }
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  const e = props.editor;
  if (e) {
    e.off("transaction", refresh);
    e.off("update", refresh);
  }
});
</script>

<template>
  <div
    class="flex h-9 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-glass-border px-2"
  >
    <template v-for="b in buttons" :key="b.action.id">
      <span v-if="b.sepBefore" class="mx-1 h-5 w-px shrink-0 bg-glass-border" />
      <button
        type="button"
        class="grid h-6 shrink-0 place-items-center rounded px-1.5 text-xs text-text-muted hover:bg-glass-hover hover:text-text disabled:opacity-40"
        :class="{ 'bg-glass-active text-text': b.active }"
        :disabled="b.disabled"
        :title="b.action.title"
        @click="runAction(b.action)"
      >
        {{ b.glyph }}
      </button>
    </template>

    <span class="mx-1 h-5 w-px shrink-0 bg-glass-border" />
    <button
      type="button"
      class="grid h-6 w-6 shrink-0 place-items-center rounded text-sm text-text-muted hover:bg-glass-hover hover:text-text"
      title="Search notes"
      @click="notes.focusSearch()"
    >
      🔍
    </button>
    <button
      type="button"
      class="grid h-6 w-6 shrink-0 place-items-center rounded text-sm text-text-muted hover:bg-glass-hover hover:text-text"
      :class="{ 'bg-glass-active text-text': shell.tocVisible }"
      title="Table of contents"
      @click="shell.toggleToc()"
    >
      📋
    </button>
    <button
      type="button"
      class="grid h-6 w-6 shrink-0 place-items-center rounded text-sm text-text-muted hover:bg-glass-hover hover:text-text"
      :class="{ 'bg-glass-active text-text': shell.propertiesVisible }"
      title="Properties"
      @click="shell.toggleProperties()"
    >
      ℹ
    </button>
    <span v-if="props.saving" class="ml-auto shrink-0 text-xs text-text-muted">Saving…</span>
    <span v-else-if="props.savedAt" class="ml-auto shrink-0 text-xs text-text-muted">Saved</span>
    <button
      type="button"
      class="ml-auto grid h-6 w-6 shrink-0 place-items-center rounded text-sm text-text-muted hover:bg-glass-hover hover:text-text"
      title="Command palette (⌘⇧P)"
      @click="palette.openPalette()"
    >
      ⋯
    </button>
  </div>
</template>