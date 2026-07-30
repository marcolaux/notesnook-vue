/**
 * Suggestion `render` contract for slash-commands. Mounts `SlashMenu.vue` via
 * TipTap's `VueRenderer`, updates its props as the query changes, forwards
 * Arrow/Enter to the component's exposed nav methods, and cancels on Escape by
 * deleting the suggestion range (which removes the `/` decoration → the
 * Suggestion plugin fires `onExit`). `onExit` destroys the renderer.
 */
import type { Editor } from "@tiptap/vue-3";
import { VueRenderer } from "@tiptap/vue-3";
import type { SuggestionProps, SuggestionKeyDownProps } from "@tiptap/suggestion";
import SlashMenu from "./SlashMenu.vue";
import type { SlashItem } from "../../tool-definitions";

type RenderProps = SuggestionProps<SlashItem, SlashItem>;

interface RenderState {
  component: VueRenderer | null;
  props: RenderProps | null;
}

function syncProps(state: RenderState, props: RenderProps): void {
  state.props = props;
  state.component?.updateProps({
    items: props.items,
    command: props.command,
    clientRect: props.clientRect
  });
}

export function slashMenuRenderer(): {
  onStart: (props: RenderProps) => void;
  onUpdate: (props: RenderProps) => void;
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
  onExit: () => void;
} {
  const state: RenderState = { component: null, props: null };

  // Close the menu when the host asks all popups to close — e.g. a new note is
  // created → the active tab switches → this editor is deactivated but kept
  // alive by <KeepAlive>, so the Suggestion plugin never fires `onExit` on its
  // own and the teleported menu would stay painted. Mirroring Escape: delete
  // the `/`-trigger + query so the decoration is removed → the plugin fires
  // `onExit` → the renderer cleans up and removes this listener.
  function closeOnExternal(): void {
    const p = state.props;
    if (p) {
      try {
        p.editor.chain().focus().deleteRange(p.range).run();
      } catch {}
    }
  }

  return {
    onStart(props: RenderProps) {
      state.component = new VueRenderer(SlashMenu, {
        props: {
          items: props.items,
          command: props.command,
          clientRect: props.clientRect
        },
        editor: props.editor as unknown as Editor
      });
      state.props = props;
      if (typeof window !== "undefined") {
        window.addEventListener("app:close-popups", closeOnExternal);
      }
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
        // Delete the `/`-trigger + query so the suggestion decoration is removed
        // → the plugin fires onExit → menu unmounts.
        const p = state.props;
        if (p) {
          p.editor.chain().focus().deleteRange(p.range).run();
        }
        return true;
      }
      return false;
    },

    onExit() {
      if (typeof window !== "undefined") {
        window.removeEventListener("app:close-popups", closeOnExternal);
      }
      state.component?.destroy();
      state.component = null;
      state.props = null;
    }
  };
}