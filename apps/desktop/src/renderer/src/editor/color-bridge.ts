/**
 * Editor colour-picker bridge (Phase 5.5 toolbar) — wires the
 * `editor.storage.openEditorColorPicker` host hook that the `textColor` /
 * `highlight` editor actions (kind `"color"`) invoke from the command palette
 * and from the toolbar colour submenu's "Custom…" entry.
 *
 * Mirrors the attachment-bridge pattern (`wireAttachmentStorage`): a pure
 * function that mutates `editor.storage`, no Vue/Pinia imports at module top
 * (keeps editor-vue and the bridge decoupled from the stores; the editor-vue
 * `tool-definitions.ts` `run` only references the hook via a structural cast).
 *
 * Uses a hidden native `<input type="color">` rather than the note-colour
 * `ColorEditorDialog` (which requires a "title" — wrong for inline text colour,
 * where only the hex code matters). The OS colour picker is the natural UX
 * here; the preset swatches in the toolbar submenu are the one-click path.
 *
 * `target` selects which mark the chosen colour applies to:
 *  - `"text"`      → `editor.chain().focus().setColor(code).run()` (Color +
 *                    TextStyle extensions, registered in Editor.vue).
 *  - `"highlight"` → `editor.chain().focus().toggleHighlight({ color: code })
 *                    .run()` (Highlight configured multicolor).
 */
import type { Editor } from "@tiptap/vue-3";

export type ColorPickerTarget = "text" | "highlight";

export function wireEditorColorPicker(editor: Editor): void {
  const storage = editor.storage as Record<string, unknown>;
  storage.openEditorColorPicker = (target: ColorPickerTarget): void => {
    if (editor.isDestroyed) return;
    const input = document.createElement("input");
    input.type = "color";
    input.value = "#f44336";
    input.style.position = "fixed";
    input.style.opacity = "0";
    input.style.pointerEvents = "none";
    input.addEventListener("change", () => {
      const code = input.value;
      input.remove();
      if (editor.isDestroyed) return;
      // `chain().focus()` returns `ChainedCommands` whose available commands
      // depend on the editor's loaded extensions; cast to `any` so this bridge
      // stays decoupled from a specific extension set (same idiom as
      // editor-vue's `tool-definitions.ts` `chain` helper).
      const c = editor.chain().focus() as unknown as {
        setColor: (code: string) => { run: () => void };
        toggleHighlight: (opts: { color: string }) => { run: () => void };
      };
      if (target === "highlight") {
        // `toggleHighlight({ color })` with a fresh colour sets it; toggling the
        // same colour again would unset — fine for a picker (the user chose it).
        c.toggleHighlight({ color: code }).run();
      } else {
        c.setColor(code).run();
      }
    });
    // If the picker is dismissed without a choice (Esc), clean up the input.
    input.addEventListener("blur", () => input.remove(), { once: true });
    document.body.append(input);
    input.click();
  };
}