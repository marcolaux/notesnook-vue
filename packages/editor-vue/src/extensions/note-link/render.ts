/**
 * Suggestion `render` contract for the `@`/`[[` note-link picker. Mounts
 * `NoteLinkPicker.vue` via TipTap's `VueRenderer`, updates its props as the
 * query changes, forwards Arrow/Enter to the component's exposed nav methods,
 * and cancels on Escape by deleting the suggestion range (which removes the
 * trigger decoration → the plugin fires `onExit` → popup unmounts). Twin of
 * `tag-mention/render.ts`.
 *
 * The block-drilldown (`getBlocks`) and i18n `labels` are host-injected onto
 * `editor.storage` (by `wireNoteLink` in the renderer) and forwarded to the
 * popup here so the picker stays presentational.
 */
import type { Editor } from "@tiptap/vue-3";
import { VueRenderer } from "@tiptap/vue-3";
import type { SuggestionProps, SuggestionKeyDownProps } from "@tiptap/suggestion";
import NoteLinkPicker from "./NoteLinkPicker.vue";
import type {
  NoteSuggestionItem,
  ContentBlockItem,
  NoteLinkResult,
  NoteLinkLabels
} from "./types";

type RenderProps = SuggestionProps<NoteSuggestionItem, NoteLinkResult>;

interface RenderState {
  component: VueRenderer | null;
  props: RenderProps | null;
}

type Storage = Record<string, unknown>;

function getBlocksFn(editor: Editor): ((noteId: string) => Promise<ContentBlockItem[]>) | undefined {
  return (editor.storage as Storage).getContentBlocks as
    | ((noteId: string) => Promise<ContentBlockItem[]>)
    | undefined;
}

function createNoteFn(
  editor: Editor
): ((title: string) => Promise<{ id: string; title: string } | null>) | undefined {
  return (editor.storage as Storage).createNoteForLink as
    | ((title: string) => Promise<{ id: string; title: string } | null>)
    | undefined;
}

function pickLocalFileFn(
  editor: Editor
): (() => Promise<{ href: string; title: string } | null>) | undefined {
  return (editor.storage as Storage).pickLocalFile as
    | (() => Promise<{ href: string; title: string } | null>)
    | undefined;
}

function labelsFn(editor: Editor): Partial<NoteLinkLabels> | undefined {
  return (editor.storage as Storage).noteLinkLabels as Partial<NoteLinkLabels> | undefined;
}

function syncProps(state: RenderState, props: RenderProps): void {
  state.props = props;
  state.component?.updateProps({
    items: props.items,
    query: props.query,
    command: props.command,
    clientRect: props.clientRect,
    createNote: createNoteFn(props.editor as unknown as Editor),
    pickLocalFile: pickLocalFileFn(props.editor as unknown as Editor)
  });
}

export function noteLinkMenuRenderer(): {
  onStart: (props: RenderProps) => void;
  onUpdate: (props: RenderProps) => void;
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
  onExit: () => void;
} {
  const state: RenderState = { component: null, props: null };

  return {
    onStart(props: RenderProps) {
      state.component = new VueRenderer(NoteLinkPicker, {
        props: {
          variant: "inline",
          items: props.items,
          query: props.query,
          command: props.command,
          clientRect: props.clientRect,
          getBlocks: getBlocksFn(props.editor as unknown as Editor),
          createNote: createNoteFn(props.editor as unknown as Editor),
          pickLocalFile: pickLocalFileFn(props.editor as unknown as Editor),
          labels: labelsFn(props.editor as unknown as Editor),
          onClose: () => {
            const p = state.props;
            if (p) {
              try {
                p.editor.chain().focus().deleteRange(p.range).run();
              } catch {}
            }
            state.component?.destroy();
            state.component = null;
            state.props = null;
          }
        },

        editor: props.editor as unknown as Editor
      });
      state.props = props;
    },

    onUpdate(props: RenderProps) {
      syncProps(state, props);
    },

    onKeyDown({ event }: SuggestionKeyDownProps): boolean {
      const ref = state.component?.ref;
      if (event.key === "ArrowDown") {
        ref?.next?.();
        return true;
      }
      if (event.key === "ArrowUp") {
        ref?.prev?.();
        return true;
      }
      if (event.key === "Enter") {
        ref?.selectActive?.();
        return true;
      }
      if (event.key === "Escape") {
        // Delete the trigger + query so the suggestion decoration is removed
        // → the plugin fires onExit → popup unmounts.
        const p = state.props;
        if (p) {
          p.editor.chain().focus().deleteRange(p.range).run();
        }
        return true;
      }
      return false;
    },

    onExit() {
      state.component?.destroy();
      state.component = null;
      state.props = null;
    }
  };
}