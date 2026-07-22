<script setup lang="ts">
/*
Code-block node-view — an editable `<pre>` (the contentDOM, syntax-highlighted
by the refractor HighlighterPlugin's inline decorations) with a toolbar below
showing caret position, indent-mode toggle, language selector, and copy.
Ported from @notesnook/editor's React `CodeblockComponent`
(extensions/code-block/component.tsx, GPL-3.0); React `createNodeView` +
`forwardRef` are replaced by `NodeViewWrapper` + `NodeViewContent`.

Scoped differences from upstream (this 2.4c increment):
  - No `@notesnook/intl` strings (not on npm — decision #1); English strings
    are inlined. i18n arrives in Phase 7.
  - No theme engine (`useThemeEngineStore`/`theme.codeBlockCSS`); styling is
    Tailwind theme tokens (`bg-code-bg`/`bg-glass-*`/`text-text*`) so the block
    follows the app theme. The Prism syntax palette is branched dark/light in the
    app's global `style.css` (by `<html data-theme>`), not a scoped `<style>`.
  - No `ResponsivePresenter` popup (mobile sheet / desktop popup); a minimal
    absolutely-positioned searchable list is used instead. Mobile arrives
    with decision #8.
  - No `config` store; last-used language persists via `setLastUsedLanguage`
    (localStorage) exported from `code-block.ts`.
  - No `useTimer`; the "Copied" feedback uses a plain `ref` + `setTimeout`.
  - Copy uses `navigator.clipboard.writeText` (upstream's
    `editor.storage.copyToClipboard` rich-HTML copy is dropped).
*/
import { computed, ref } from "vue";
import { NodeViewWrapper, NodeViewContent, type NodeViewProps } from "@tiptap/vue-3";
import Languages from "./languages.json";
import { setLastUsedLanguage } from "./code-block";
import type { CodeBlockAttributes, CodeBlockOptions } from "./code-block";
import type { CaretPosition } from "./utils";
import { Check } from "@lucide/vue";

type LanguageDef = { filename: string; title: string; alias?: string[] };

const props = defineProps<NodeViewProps>();

const isOpen = ref(false);
const copied = ref(false);
const query = ref("");

const attrs = computed(() => props.node.attrs as CodeBlockAttributes);
const language = computed(() => attrs.value.language);
const indentType = computed(() => attrs.value.indentType);
const indentLength = computed(() => attrs.value.indentLength);
const caret = computed(() => attrs.value.caretPosition as CaretPosition | undefined);

const languageDefinition = computed<LanguageDef | undefined>(() =>
  Languages.find(
    (l) => l.filename === language.value || l.alias?.some((a) => a === language.value)
  )
);

// `language-<filename>` class on the contentDOM (matches upstream's
// contentDOMFactory; whitespace replaced with "-" for class validity).
const langClass = computed(
  () =>
    `language-${(languageDefinition.value?.filename ?? "xyz")}`.replace(/\s/, "-")
);

const filteredLanguages = computed<LanguageDef[]>(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return Languages as LanguageDef[];
  return (Languages as LanguageDef[]).filter(
    (l) =>
      l.title.toLowerCase().includes(q) || l.alias?.some((a) => a.toLowerCase().includes(q))
  );
});

const editorEditable = computed(() => props.editor.isEditable);

function toggleIndentation(): void {
  if (!editorEditable.value) return;
  props.editor.commands.changeCodeBlockIndentation({
    type: indentType.value === "space" ? "tab" : "space",
    amount: Number(indentLength.value) || 2
  });
}

function selectLanguage(filename: string): void {
  setLastUsedLanguage(filename);
  props.updateAttributes({ language: filename });
  isOpen.value = false;
  query.value = "";
  props.editor.commands.focus();
}

async function copyCode(): Promise<void> {
  const text = props.node.textContent;
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    copied.value = true;
    setTimeout(() => (copied.value = false), 1000);
  } catch {
    // ignore — clipboard unavailable
  }
}

function onSearchKeydown(e: KeyboardEvent): void {
  if (e.key === "Enter") {
    const first = filteredLanguages.value[0];
    if (first) selectLanguage(first.filename);
    e.preventDefault();
  } else if (e.key === "Escape") {
    isOpen.value = false;
    query.value = "";
    props.editor.commands.focus();
    e.preventDefault();
  }
}
</script>

<template>
  <NodeViewWrapper as="div" class="codeblock-node my-3 overflow-hidden rounded-md border border-glass-border bg-code-bg">
    <NodeViewContent
      as="pre"
      class="node-content-wrapper scroll-bar m-0 w-full px-3 py-2.5 font-mono leading-5 outline-none"
      :class="langClass"
      style="white-space: pre; min-width: 20px; tab-size: 1"
      :spellcheck="false"
    />
    <div
      class="flex items-center justify-end gap-1 border-t border-glass-border bg-glass-surface px-2 py-1 text-[11px] text-text-muted"
      contenteditable="false"
    >
      <span v-if="caret" class="mr-1 tabular-nums">
        Ln {{ caret.line }}, Col {{ caret.column }}
        <span v-if="caret.selected">({{ caret.selected }} selected)</span>
      </span>

      <button
        type="button"
        class="rounded px-1.5 py-0.5 hover:bg-glass-hover disabled:opacity-40"
        :title="`Toggle indentation (${indentType})`"
        :disabled="!editorEditable"
        @click="toggleIndentation"
      >
        {{ indentType === "space" ? "Spaces" : "Tabs" }}: {{ indentLength }}
      </button>

      <button
        type="button"
        class="rounded px-1.5 py-0.5 hover:bg-glass-hover disabled:opacity-40"
        :class="{ 'bg-glass-active': isOpen }"
        :title="'Change language'"
        :disabled="!editorEditable"
        @click="isOpen = !isOpen"
      >
        {{ languageDefinition?.title || "Plaintext" }}
      </button>

      <button
        v-if="node.textContent && node.textContent.length > 0"
        type="button"
        class="rounded px-1.5 py-0.5 text-text-muted hover:bg-glass-hover"
        title="Copy code"
        @click="copyCode"
      >
        {{ copied ? "Copied" : "Copy" }}
      </button>
    </div>

    <div v-if="isOpen" class="codeblock-langpopup relative">
      <div class="absolute bottom-full right-0 z-30 mb-1 w-64 overflow-hidden rounded-md border border-glass-border bg-code-bg shadow-lg">
        <input
          v-model="query"
          type="text"
          placeholder="Search languages…"
          class="w-full border-b border-glass-border bg-transparent px-2 py-1.5 text-xs text-text outline-none placeholder:text-text-muted"
          spellcheck="false"
          @keydown="onSearchKeydown"
        />
        <div class="max-h-48 overflow-y-auto py-1">
          <button
            v-for="lang in filteredLanguages"
            :key="lang.filename"
            type="button"
            class="flex w-full items-center justify-between px-2 py-1 text-left text-xs text-text hover:bg-glass-hover"
            @click="selectLanguage(lang.filename)"
          >
            <span>{{ lang.title }}</span>
            <Check
              v-if="languageDefinition?.filename === lang.filename"
              :size="12"
              class="text-indigo-500"
            />
            <span v-else-if="lang.alias" class="text-[9px] text-text-muted">
              {{ lang.alias.slice(0, 3).join(", ").toUpperCase() }}
            </span>
          </button>
        </div>
      </div>
    </div>
  </NodeViewWrapper>
</template>