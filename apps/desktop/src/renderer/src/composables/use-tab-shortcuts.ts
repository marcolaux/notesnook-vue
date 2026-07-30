/**
 * Tab keyboard shortcuts composable (Phase 4.2).
 * Listens for global window keydown events and triggers tab switching / creation / closing:
 *
 *  - Next Tab: `Ctrl+Tab`, `Cmd+Alt+Right`, `Cmd+Shift+]`, `Ctrl+PageDown`
 *  - Previous Tab: `Ctrl+Shift+Tab`, `Cmd+Alt+Left`, `Cmd+Shift+[`, `Ctrl+PageUp`
 *  - Tab by index: `Cmd/Ctrl + 1` .. `8` (1st to 8th tab)
 *  - Last Tab: `Cmd/Ctrl + 9`
 *  - New Tab / Note: `Cmd/Ctrl + T`
 *  - Open today's daily note: `Cmd/Ctrl + D`
 *  - Detach focused pane to new window: `Cmd/Ctrl + Shift + K` (Phase 4.6)
 */
import { onMounted, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import { useEditorLayoutStore } from "@/stores/editor-layout";
import { useNotesStore } from "@/stores/notes";
import { useAuthStore } from "@/stores/auth";
import { useDailyNotesStore } from "@/stores/daily-notes";
import { todayIso } from "@/utils/daily-notes";
import { desktop } from "@/platform/desktop-bridge";
import { readCurrentContext } from "@/platform/account-context";
import { getCurrentContext } from "@/platform/bootstrap";

export function useTabShortcuts(): void {
  const layout = useEditorLayoutStore();
  const notes = useNotesStore();
  const auth = useAuthStore();
  const router = useRouter();
  const daily = useDailyNotesStore();

  function onKeydown(e: KeyboardEvent): void {
    if (!auth.showShell) return;

    const isMac = typeof navigator !== "undefined" && navigator.platform.toLowerCase().includes("mac");
    const metaOrCtrl = isMac ? e.metaKey : e.ctrlKey;

    // --- Cmd/Ctrl + , -> Settings ---
    if (metaOrCtrl && !e.shiftKey && !e.altKey && (e.key === "," || e.code === "Comma")) {
      e.preventDefault();
      e.stopPropagation();
      void desktop.window.openSettings.mutate({ contextId: getCurrentContext() }).catch(() => undefined);
      return;
    }

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

    // --- Cmd/Ctrl + D -> Open today's daily note ---
    // Mirrors the `app:open-today-daily-note` palette command: shows the
    // `/daily` timeline and opens today's note (or a prefilled draft when none
    // exists yet). The view's own mount watcher also opens today, but only
    // fires on first entry — calling `openDailyNote` directly covers the
    // already-on-`/daily` case.
    if (metaOrCtrl && !e.shiftKey && !e.altKey && (e.key === "d" || e.key === "D")) {
      e.preventDefault();
      e.stopPropagation();
      void router.push("/daily").then(() => daily.openDailyNote(todayIso()));
      return;
    }

    // --- Cmd/Ctrl + Shift + K -> Detach focused pane to new window (Phase 4.6) ---
    // Captures the focused pane's snapshot, asks main to open a pane window for
    // it, then closes the pane here (force: even the only pane empties the
    // source — the tabs went with the snapshot). No-op when the focused pane
    // has no portable (note/attachment) tabs.
    if (metaOrCtrl && e.shiftKey && !e.altKey && (e.key === "k" || e.key === "K")) {
      const groupId = layout.activeGroupId;
      const hasPortable = layout.tabsOf(groupId).some((t) => t.kind !== "search");
      if (hasPortable) {
        e.preventDefault();
        e.stopPropagation();
        const snapshot = layout.detachGroupSnapshot(groupId);
        if (!snapshot) return;
        const contextId = readCurrentContext();
        void desktop.window.openPaneWindow.mutate({ snapshot, contextId });
        layout.closeGroup(groupId, true);
      }
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
