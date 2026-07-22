import { defineStore } from "pinia";
import { shallowRef, ref, computed } from "vue";
import type { Editor } from "@tiptap/vue-3";

/**
 * Cross-component channel for the *focused* pane's TipTap `Editor` instance
 * (Phase 4.2 — split-pane aware).
 *
 * Each `Editor.vue` (one per tab/pane) owns its editor via `useEditor`, but the
 * command palette + editor-action registry need to reach `editor.chain()` for
 * the **focused** pane only. A single last-writer-wins slot would clobber on
 * every background-pane mount/keystroke, so instead this store holds a
 * `registry` of every live editor keyed by a stable per-instance key
 * (`tabId`, or `"draft:" + groupId` for an empty pane's draft editor) plus a
 * `focusedKey` set by the view from the layout store
 * (`layout.activeTab?.id ?? "draft:" + layout.activeGroupId`). The `editor`
 * computed resolves the focused key's instance — race-free, and `undefined`
 * when the focused pane has no live editor (e.g. an empty pane before its
 * editor mounts).
 *
 * `Editor.vue` registers on editor-ready and unregisters on unmount
 * (cache-evict / pane close). The ref is a plain `Record` of `Editor` instances
 * (not deeply reactive — the Editor is a large, self-managed ProseMirror object;
 * deep reactivity would be wasteful and could interfere with its state).
 * `isEditable` is the only reactive view consumers need.
 */
export const useEditorStore = defineStore("editor", () => {
  // `shallowRef` so the stored `Editor` instances are NOT deep-proxied (the
  // Editor is a large self-managed ProseMirror object; proxying it would break
  // `===` identity checks and could interfere with its state). Reassigning
  // `.value` on register/unregister still triggers the `editor` computed.
  const registry = shallowRef<Record<string, Editor>>({});
  const focusedKey = ref<string | null>(null);
  /** Bumped by the "Find in note" palette command; each `Editor.vue` watches it
   *  and opens its find bar when it is the focused pane (mirrors
   *  `notes.focusSearchSignal` — a palette entry point that needs no global
   *  keybinding to reach the per-tab component state). */
  const findSignal = ref(0);

  /** Register a live editor under `key` (overwrites on re-register — same key,
   *  same instance under KeepAlive). */
  function register(key: string, e: Editor): void {
    registry.value = { ...registry.value, [key]: e };
  }

  /** Drop the editor registered under `key` (no-op if it's no longer the one
   *  stored — avoids clobbering a re-registered instance of the same key). */
  function unregister(key: string, e: Editor): void {
    if (registry.value[key] === e) {
      const next = { ...registry.value };
      delete next[key];
      registry.value = next;
    }
  }

  /** Set the focused key (the view computes this from the layout store). */
  function setFocusedKey(key: string | null): void {
    focusedKey.value = key;
  }

  /** Bump the find-signal (called by the "Find in note" palette command).
   *  Each `Editor.vue` watches it and opens its find bar when it is the focused
   *  pane (mirrors `notes.focusSearchSignal` — a palette entry point that needs
   *  no global keybinding to reach the per-tab component state). */
  function requestFind(): void {
    findSignal.value++;
  }

  /** Bump the find-toggle-signal: like `requestFind` but the focused pane
   *  TOGGLES its find bar instead of only opening it — so the toolbar
   *  magnifying-glass button closes the bar when it's already open. Kept
   *  separate from `findSignal` so the palette command + ⌘F stay open-only
   *  (standard "open find" semantics) while the icon is a toggle. */
  const findToggleSignal = ref(0);
  function requestFindToggle(): void {
    findToggleSignal.value++;
  }

  /** The focused pane's editor, or `undefined` when none is live. */
  const editor = computed<Editor | undefined>(
    () => (focusedKey.value ? registry.value[focusedKey.value] : undefined)
  );

  const isEditable = computed(() => editor.value?.isEditable ?? false);

  return {
    registry,
    focusedKey,
    findSignal,
    findToggleSignal,
    editor,
    isEditable,
    register,
    unregister,
    setFocusedKey,
    requestFind,
    requestFindToggle
  };
});