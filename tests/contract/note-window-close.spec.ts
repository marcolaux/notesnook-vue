// @vitest-environment node
/**
 * Note-window close-on-last-tab — a torn-off note window (`?window=note`) boots
 * into focus mode hosting a single note. Closing the last tab closes the
 * window, but only while focus mode is still on: if the user disabled focus
 * mode the window becomes a regular editing surface and stays open. The main
 * window (no `?window=note`) never auto-closes, and a note window with other
 * tabs remaining stays open too.
 *
 * The window-close side effect is the `desktop.window.close.mutate()` call in
 * `notes.closeTab`; here we mock the bridge and assert the call (or its
 * absence). `location.search` is stubbed per-test to simulate the window type.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useNotesStore } from "@/stores/notes";
import { useEditorLayoutStore } from "@/stores/editor-layout";
import { useShellStore } from "@/stores/shell";

const { closeMutate } = vi.hoisted(() => ({ closeMutate: vi.fn(async () => undefined) }));

vi.mock("@/platform/desktop-bridge", () => ({
  desktop: { window: { close: { mutate: closeMutate } } }
}));

// The notes store imports `getDatabase` from bootstrap at module load; stub it
// so the test never pulls in the real platform graph. `closeTab`/`selectNote`
// here never touch the db.
vi.mock("@/platform/bootstrap", () => ({
  getDatabase: vi.fn(),
  bootstrap: vi.fn()
}));

const origLocation = (globalThis as { location?: Location }).location;

function setLocation(search: string): void {
  (globalThis as { location?: { search: string } }).location = { search };
}

describe("note window — close on last tab only while focus mode is on", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    closeMutate.mockClear();
    setLocation("?window=note&noteId=n1");
  });

  afterEach(() => {
    if (origLocation === undefined) {
      delete (globalThis as { location?: Location }).location;
    } else {
      (globalThis as { location?: Location }).location = origLocation;
    }
  });

  /** Open a single tab for note `n1` in a fresh layout; returns its tab id. */
  function openOneTab(): { notes: ReturnType<typeof useNotesStore>; tabId: string } {
    const layout = useEditorLayoutStore();
    layout.init();
    const notes = useNotesStore();
    notes.selectNote("n1");
    const tabId = notes.activeTabId;
    expect(tabId).not.toBeNull();
    expect(Object.keys(layout.tabs).length).toBe(1);
    return { notes, tabId: tabId as string };
  }

  it("closes the window when the last tab closes while focus mode is on", () => {
    const { notes, tabId } = openOneTab();
    useShellStore().setFocusMode(true);
    notes.closeTab(tabId);
    expect(closeMutate).toHaveBeenCalledTimes(1);
  });

  it("does NOT close the window when focus mode is off", () => {
    const { notes, tabId } = openOneTab();
    useShellStore().setFocusMode(false);
    notes.closeTab(tabId);
    expect(closeMutate).not.toHaveBeenCalled();
  });

  it("does NOT close the window when this is not a note window (focus on)", () => {
    setLocation("");
    const { notes, tabId } = openOneTab();
    useShellStore().setFocusMode(true);
    notes.closeTab(tabId);
    expect(closeMutate).not.toHaveBeenCalled();
  });

  it("does NOT close the window when other tabs remain", () => {
    const { notes } = openOneTab();
    const layout = useEditorLayoutStore();
    notes.selectNote("n2"); // a second, distinct tab
    expect(Object.keys(layout.tabs).length).toBe(2);
    useShellStore().setFocusMode(true);
    notes.closeTab(notes.activeTabId as string); // closes the active (n2) tab
    expect(closeMutate).not.toHaveBeenCalled();
  });
});