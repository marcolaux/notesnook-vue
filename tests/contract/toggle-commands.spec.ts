// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { getCommand, type CommandContext } from "@/commands/registry";
// Importing app-commands registers the app + toggle commands into the
// (per-file-isolated) registry.
import "@/commands/app-commands";
import { useShellStore } from "@/stores/shell";

function stubCtx(shell: ReturnType<typeof useShellStore>, showShell: boolean): CommandContext {
  return {
    editor: undefined,
    notes: undefined as unknown as CommandContext["notes"],
    auth: { showShell } as unknown as CommandContext["auth"],
    shell,
    sync: undefined as unknown as CommandContext["sync"],
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
    for (const id of ids) {
      const cmd = getCommand(id)!;
      expect(cmd.when?.(stubCtx(shell, false), undefined)).toBe(false);
    }
  });

  it("visible when the shell is showing", () => {
    const shell = useShellStore();
    for (const id of ids) {
      const cmd = getCommand(id)!;
      expect(cmd.when?.(stubCtx(shell, true), undefined)).toBe(true);
    }
  });

  it("toggle-sidebar flips sidebarCollapsed", () => {
    const shell = useShellStore();
    expect(shell.sidebarCollapsed).toBe(false);
    getCommand("app:toggle-sidebar")!.run(stubCtx(shell, true));
    expect(shell.sidebarCollapsed).toBe(true);
    getCommand("app:toggle-sidebar")!.run(stubCtx(shell, true));
    expect(shell.sidebarCollapsed).toBe(false);
  });

  it("toggle-list flips listCollapsed", () => {
    const shell = useShellStore();
    expect(shell.listCollapsed).toBe(false);
    getCommand("app:toggle-list")!.run(stubCtx(shell, true));
    expect(shell.listCollapsed).toBe(true);
  });

  it("toggle-toc flips tocVisible", () => {
    const shell = useShellStore();
    expect(shell.tocVisible).toBe(false);
    getCommand("app:toggle-toc")!.run(stubCtx(shell, true));
    expect(shell.tocVisible).toBe(true);
    getCommand("app:toggle-toc")!.run(stubCtx(shell, true));
    expect(shell.tocVisible).toBe(false);
  });

  it("toggle-properties flips propertiesVisible", () => {
    const shell = useShellStore();
    expect(shell.propertiesVisible).toBe(false);
    getCommand("app:toggle-properties")!.run(stubCtx(shell, true));
    expect(shell.propertiesVisible).toBe(true);
  });

  it("toggles are independent", () => {
    const shell = useShellStore();
    getCommand("app:toggle-toc")!.run(stubCtx(shell, true));
    getCommand("app:toggle-properties")!.run(stubCtx(shell, true));
    getCommand("app:toggle-properties")!.run(stubCtx(shell, true)); // back off
    expect(shell.tocVisible).toBe(true);
    expect(shell.propertiesVisible).toBe(false);
  });
});