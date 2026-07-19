/**
 * Command-palette hotkey composable (Phase 2.5). Registers a global
 * `keydown` listener on `window` that toggles the palette on
 * `Ctrl/Cmd+Shift+P` and closes it on `Escape`. Mounted from `App.vue` (the
 * root shell, always mounted while the shell is visible). The palette store
 * owns all state; this only forwards key events to it.
 *
 * The visual overlay is a deferred follow-up — until it lands, `Ctrl+Shift+P`
 * only flips `paletteStore.open` (verifiable via a Pinia inspector in DevTools).
 */
import { onMounted, onBeforeUnmount } from "vue";
import { useCommandPaletteStore } from "@/stores/command-palette";

export function useCommandPalette(): void {
  const palette = useCommandPaletteStore();

  function onKey(e: KeyboardEvent): void {
    // Ctrl/Cmd + Shift + P → toggle the palette.
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "p" || e.key === "P")) {
      e.preventDefault();
      if (palette.open) palette.closePalette();
      else palette.openPalette();
      return;
    }
    // Escape → close (only while open; harmless otherwise).
    if (e.key === "Escape" && palette.open) {
      palette.closePalette();
    }
  }

  onMounted(() => window.addEventListener("keydown", onKey));
  onBeforeUnmount(() => window.removeEventListener("keydown", onKey));
}