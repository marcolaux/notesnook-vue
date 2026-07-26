/**
 * Tab keyboard shortcuts composable (Phase 4.2).
 * Listens for global window keydown events and triggers tab switching / creation / closing:
 *
 *  - Next Tab: `Ctrl+Tab`, `Cmd+Alt+Right`, `Cmd+Shift+]`, `Ctrl+PageDown`
 *  - Previous Tab: `Ctrl+Shift+Tab`, `Cmd+Alt+Left`, `Cmd+Shift+[`, `Ctrl+PageUp`
 *  - Tab by index: `Cmd/Ctrl + 1` .. `8` (1st to 8th tab)
 *  - Last Tab: `Cmd/Ctrl + 9`
 *  - New Tab / Note: `Cmd/Ctrl + T`
 */
import { onMounted, onUnmounted } from "vue";
import { useEditorLayoutStore } from "@/stores/editor-layout";
import { useNotesStore } from "@/stores/notes";
import { useAuthStore } from "@/stores/auth";

export function useTabShortcuts(): void {
  const layout = useEditorLayoutStore();
  const notes = useNotesStore();
  const auth = useAuthStore();

  function onKeydown(e: KeyboardEvent): void {
    if (!auth.showShell) return;

    const isMac = typeof navigator !== "undefined" && navigator.platform.toLowerCase().includes("mac");
    const metaOrCtrl = isMac ? e.metaKey : e.ctrlKey;

    // --- Next Tab ---
    if (
      (e.ctrlKey && !e.shiftKey && e.key === "Tab" && !e.metaKey) ||
      (metaOrCtrl && e.altKey && (e.key === "ArrowRight" || e.key === "Right")) ||
      (metaOrCtrl && e.shiftKey && (e.key === "]" || e.key === "}")) ||
      (e.ctrlKey && e.key === "PageDown")
    ) {
      e.preventDefault();
      e.stopPropagation();
      layout.cycleTab(1);
      return;
    }

    // --- Previous Tab ---
    if (
      (e.ctrlKey && e.shiftKey && e.key === "Tab" && !e.metaKey) ||
      (metaOrCtrl && e.altKey && (e.key === "ArrowLeft" || e.key === "Left")) ||
      (metaOrCtrl && e.shiftKey && (e.key === "[" || e.key === "{")) ||
      (e.ctrlKey && e.key === "PageUp")
    ) {
      e.preventDefault();
      e.stopPropagation();
      layout.cycleTab(-1);
      return;
    }

    // --- Tab 1..8 and Tab 9 (last tab) ---
    if (metaOrCtrl && !e.shiftKey && !e.altKey && (e.code.startsWith("Digit") || (e.key >= "1" && e.key <= "9"))) {
      const char = e.code.startsWith("Digit") ? e.code.replace("Digit", "") : e.key;
      const digit = parseInt(char, 10);
      if (!isNaN(digit) && digit >= 1 && digit <= 9) {
        e.preventDefault();
        e.stopPropagation();
        if (digit === 9) {
          layout.activateTabAtIndex(-1);
        } else {
          layout.activateTabAtIndex(digit - 1);
        }
        return;
      }
    }

    // --- Cmd/Ctrl + T -> New Note / New Tab ---
    if (metaOrCtrl && !e.shiftKey && !e.altKey && (e.key === "t" || e.key === "T")) {
      e.preventDefault();
      e.stopPropagation();
      void notes.create();
      return;
    }
  }

  onMounted(() => {
    window.addEventListener("keydown", onKeydown, true);
  });

  onUnmounted(() => {
    window.removeEventListener("keydown", onKeydown, true);
  });
}
