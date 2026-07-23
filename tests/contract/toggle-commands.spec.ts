// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { getCommand, type CommandContext } from "@/commands/registry";
// Importing app-commands registers the app + toggle commands into the
// (per-file-isolated) registry.
import "@/commands/app-commands";
import { useShellStore } from "@/stores/shell";
import { useEditorLayoutStore } from "@/stores/editor-layout";

function stubCtx(
  shell: ReturnType<typeof useShellStore>,
  showShell: boolean,
  layout: ReturnType<typeof useEditorLayoutStore>
): CommandContext {
  return {
    editor: undefined,
    notes: undefined as unknown as CommandContext["notes"],
    auth: { showShell } as unknown as CommandContext["auth"],
    shell,
    layout,
    sync: undefined as unknown as CommandContext["sync"],
    updater: undefined as unknown as CommandContext["updater"],
    spellChecker: undefined as CommandContext["spellChecker"],
    router: undefined as CommandContext["router"],
    closePalette: () => {}
  };
}

describe("app toggle commands (Phase 5.3)", () => {
  beforeEach(() => setActivePinia(createPinia()));

  const ids = ["app:toggle-sidebar", "app:toggle-list", "app:toggle-toc", "app:toggle-properties"];

  it("all four toggle commands are registered", () => {
    for (const id of ids) expect(getCommand(id), id).toBeDefined();
  });

  it("hidden when the shell is not showing (not logged in / not local-only)", () => {
    const shell = useShellStore();
    const layout = useEditorLayoutStore();
    for (const id of ids) {
      const cmd = getCommand(id)!;
      expect(cmd.when?.(stubCtx(shell, false, layout), undefined)).toBe(false);
    }
  });

  it("visible when the shell is showing", () => {
    const shell = useShellStore();
    const layout = useEditorLayoutStore();
    for (const id of ids) {
      const cmd = getCommand(id)!;
      expect(cmd.when?.(stubCtx(shell, true, layout), undefined)).toBe(true);
    }
  });

  it("toggle-sidebar flips sidebarCollapsed", () => {
    const shell = useShellStore();
    const layout = useEditorLayoutStore();
    expect(shell.sidebarCollapsed).toBe(false);
    getCommand("app:toggle-sidebar")!.run(stubCtx(shell, true, layout));
    expect(shell.sidebarCollapsed).toBe(true);
    getCommand("app:toggle-sidebar")!.run(stubCtx(shell, true, layout));
    expect(shell.sidebarCollapsed).toBe(false);
  });

  it("toggle-list flips listCollapsed", () => {
    const shell = useShellStore();
    const layout = useEditorLayoutStore();
    expect(shell.listCollapsed).toBe(false);
    getCommand("app:toggle-list")!.run(stubCtx(shell, true, layout));
    expect(shell.listCollapsed).toBe(true);
  });

  it("toggle-toc flips the active note tab's tocVisible (per-tab)", () => {
    const shell = useShellStore();
    const layout = useEditorLayoutStore();
    layout.init();
    const id = layout.openTab(layout.activeGroupId, "note-a");
    expect(layout.tabs[id].tocVisible).toBeFalsy();
    getCommand("app:toggle-toc")!.run(stubCtx(shell, true, layout));
    expect(layout.tabs[id].tocVisible).toBe(true);
    expect(layout.tabs[id].tocMode).toBe("toc");
    getCommand("app:toggle-toc")!.run(stubCtx(shell, true, layout));
    expect(layout.tabs[id].tocVisible).toBe(false);
  });

  it("toggle-properties flips propertiesVisible", () => {
    const shell = useShellStore();
    const layout = useEditorLayoutStore();
    expect(shell.propertiesVisible).toBe(false);
    getCommand("app:toggle-properties")!.run(stubCtx(shell, true, layout));
    expect(shell.propertiesVisible).toBe(true);
  });

  it("toggles are independent", () => {
    const shell = useShellStore();
    const layout = useEditorLayoutStore();
    layout.init();
    layout.openTab(layout.activeGroupId, "note-a");
    getCommand("app:toggle-toc")!.run(stubCtx(shell, true, layout));
    getCommand("app:toggle-properties")!.run(stubCtx(shell, true, layout));
    getCommand("app:toggle-properties")!.run(stubCtx(shell, true, layout)); // back off
    expect(layout.activeTab?.tocVisible).toBe(true);
    expect(shell.propertiesVisible).toBe(false);
  });
});