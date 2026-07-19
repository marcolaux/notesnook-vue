/*
Ported from @notesnook/editor (GPL-3.0), extensions/code-block/code-block.ts.

The ProseMirror schema (addAttributes/parseHTML/renderHTML), commands, input
rules, and the refractor HighlighterPlugin are copied verbatim so stored
codeblocks round-trip byte-for-byte (`<pre class="language-xx"
data-indent-type data-indent-length><code>…</code></pre>`). The React
`createNodeView(CodeblockComponent, { contentDOMFactory, shouldUpdate })`
layer is replaced by `VueNodeViewRenderer(CodeBlockComponent, { update })`;
the contentDOM (`pre.node-content-wrapper.language-xx`) is rendered via
`<NodeViewContent as="pre">` inside the Vue component.

Scoped differences from upstream (this 2.4c increment — none affect round-trip):
  - `addKeyboardShortcuts` (Tab/Shift-Tab indent, Enter indent/triple-exit,
    ArrowDown exit, Mod-a select-all) is deferred to a polish pass. The
    `changeCodeBlockIndentation` command (indent-type toggle button) stays,
    powered by the `lines` attr the HighlighterPlugin syncs.
  - The VS-Code/GitHub paste-detection plugin is deferred (paste falls back to
    ProseMirror's default text insert; ``` / ~~~ input rules still create
    codeblocks). Drops the `detect-indent`/`redent`/`strip-indent` deps.
  - `config.get/set("codeBlockLanguage")` (upstream's config store, not ported)
    is replaced by a localStorage-backed `defaultLanguage()` +
    `setLastUsedLanguage()`.
  - `nanoid` is replaced by an inline random id (`id` is `rendered: false`,
    never persisted, so the format is irrelevant to round-trip).
  - `tiptapKeys` (keyboard shortcut keymap) is not needed (shortcuts deferred).
*/
import { Node, textblockTypeInputRule, mergeAttributes, VueNodeViewRenderer } from "@tiptap/vue-3";
import CodeBlockComponent from "./CodeBlockComponent.vue";
import { HighlighterPlugin } from "./highlighter";
import type { CaretPosition, CodeLine } from "./utils";

interface Indent {
  type: "tab" | "space";
  amount: number;
}

export type CodeBlockAttributes = {
  indentType: Indent["type"];
  indentLength: number;
  language: string;
  lines: CodeLine[];
  caretPosition?: CaretPosition;
};

export interface CodeBlockOptions {
  /** Prefix for language classes applied to code tags. Defaults to `language-`. */
  languageClassPrefix: string;
  /** Exit the node on triple enter. Defaults to `true`. */
  exitOnTripleEnter: boolean;
  /** Exit on arrow down if no node follows. Defaults to `true`. */
  exitOnArrowDown: boolean;
  /** Exit on arrow up if no node precedes. Defaults to `true`. */
  exitOnArrowUp: boolean;
  /** Custom HTML attributes added to the rendered HTML tag. */
  HTMLAttributes: Record<string, unknown>;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    codeblock: {
      /** Set a code block. */
      setCodeBlock: (attributes?: { language: string }) => ReturnType;
      /** Toggle a code block. */
      toggleCodeBlock: (attributes?: { language: string }) => ReturnType;
      /** Change code block indentation options. */
      changeCodeBlockIndentation: (options: Indent) => ReturnType;
    };
  }
}

export const backtickInputRegex = /^```([a-z]+)?[\s\n]$/;
export const tildeInputRegex = /^~~~([a-z]+)?[\s\n]$/;

// Last-used language, persisted to localStorage (replaces upstream's `config`).
let lastLanguage = "Plaintext";
try {
  if (typeof localStorage !== "undefined") {
    lastLanguage = localStorage.getItem("codeBlockLanguage") || "Plaintext";
  }
} catch {
  // ignore — non-browser env (tests)
}
function defaultLanguage(): string {
  return lastLanguage;
}
export function setLastUsedLanguage(language: string): void {
  lastLanguage = language;
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem("codeBlockLanguage", language);
  } catch {
    // ignore
  }
}

export const CodeBlock = Node.create<CodeBlockOptions>({
  name: "codeblock",

  addOptions() {
    return {
      languageClassPrefix: "language-",
      exitOnTripleEnter: true,
      exitOnArrowDown: true,
      exitOnArrowUp: true,
      HTMLAttributes: {}
    };
  },

  content: "text*",

  marks: "",

  group: "block",

  code: true,

  defining: true,

  addAttributes() {
    return {
      id: {
        default: undefined,
        rendered: false,
        parseHTML: () => createCodeblockId()
      },
      caretPosition: {
        default: undefined,
        rendered: false
      },
      lines: {
        default: [],
        rendered: false
      },
      indentType: {
        default: "space",
        parseHTML: (element) => element.dataset.indentType,
        renderHTML: (attributes) => {
          if (!attributes.indentType) return {};
          return { "data-indent-type": attributes.indentType };
        }
      },
      indentLength: {
        default: 2,
        parseHTML: (element) => element.dataset.indentLength,
        renderHTML: (attributes) => {
          if (!attributes.indentLength) return {};
          return { "data-indent-length": attributes.indentLength };
        }
      },
      language: {
        default: null,
        parseHTML: (element) => {
          const { languageClassPrefix } = this.options;
          const classNames = [
            ...element.classList.values(),
            ...(element?.firstElementChild?.classList?.values() || [])
          ];
          const languages = classNames
            .filter((className) => className.startsWith(languageClassPrefix))
            .map((className) => className.replace(languageClassPrefix, ""));
          const language = languages[0];

          if (!language) return null;
          return language;
        },
        renderHTML: (attributes) => {
          if (!attributes.language) return {};
          return { class: `language-${attributes.language}` };
        }
      }
    };
  },

  parseHTML() {
    return [
      {
        tag: "pre",
        preserveWhitespace: "full"
      }
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "pre",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes),
      ["code", {}, 0]
    ];
  },

  addCommands() {
    return {
      setCodeBlock:
        (attributes) =>
        ({ commands }) => {
          return commands.setNode(this.name, {
            ...attributes,
            id: createCodeblockId()
          });
        },
      toggleCodeBlock:
        (attributes) =>
        ({ commands, state, tr }) => {
          const isInsideCodeBlock = this.editor.isActive(this.type.name);
          if (!isInsideCodeBlock) {
            const { from, to } = state.selection;
            const text = state.doc.textBetween(from, to, "\n");
            tr.replaceSelectionWith(
              this.type.create(
                {
                  language: defaultLanguage(),
                  ...attributes,
                  id: createCodeblockId()
                },
                text ? state.schema.text(text) : null
              )
            );
            return commands.setTextSelection({ from, to: tr.mapping.map(to) });
          }
          return commands.clearNodes();
        },
      changeCodeBlockIndentation:
        (options) =>
        ({ editor, tr, commands }) => {
          const { state } = editor;
          const { selection } = state;
          const { $from } = selection;

          if ($from.parent.type !== this.type) {
            return false;
          }

          const { lines } = $from.parent.attrs as CodeBlockAttributes;

          for (const line of lines) {
            const text = line.text();
            const whitespaceLength = text.length - text.trimStart().length;
            if (!whitespaceLength) continue;

            const indentLength = whitespaceLength;
            const indentToken = indent({
              type: options.type,
              amount: indentLength
            });

            tr.insertText(
              indentToken,
              tr.mapping.map(line.from),
              tr.mapping.map(line.from + whitespaceLength)
            );
          }

          commands.updateAttributes(this.type, {
            indentType: options.type,
            indentLength: options.amount
          });
          return true;
        }
    };
  },

  addInputRules() {
    return [
      textblockTypeInputRule({
        find: backtickInputRegex,
        type: this.type,
        getAttributes: (match) => ({
          language: match[1] ?? defaultLanguage(),
          id: createCodeblockId()
        })
      }),
      textblockTypeInputRule({
        find: tildeInputRegex,
        type: this.type,
        getAttributes: (match) => ({
          language: match[1] ?? defaultLanguage(),
          id: createCodeblockId()
        })
      })
    ];
  },

  addProseMirrorPlugins() {
    return [
      HighlighterPlugin({
        name: this.name,
        defaultLanguage
      })
    ];
  },

  addNodeView() {
    return VueNodeViewRenderer(CodeBlockComponent, {
      // Re-render when caret position, language, or indent type changes
      // (matches upstream `shouldUpdate`; the `hidden` attr is upstream-only).
      update: ({ oldNode, newNode }) =>
        compareCaretPosition(
          oldNode.attrs.caretPosition as CaretPosition | undefined,
          newNode.attrs.caretPosition as CaretPosition | undefined
        ) ||
        oldNode.attrs.language !== newNode.attrs.language ||
        oldNode.attrs.indentType !== newNode.attrs.indentType
    });
  }
});

function indent(options: Indent): string {
  const char = options.type === "space" ? " " : "\t";
  return char.repeat(options.amount);
}

function compareCaretPosition(
  prev: CaretPosition | undefined,
  next: CaretPosition | undefined
): boolean {
  return (
    next === undefined ||
    prev?.column !== next?.column ||
    prev?.line !== next?.line
  );
}

function createCodeblockId(): string {
  return `codeblock-${Math.random().toString(36).slice(2, 14)}`;
}