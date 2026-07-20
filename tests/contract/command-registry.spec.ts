import { describe, it, expect, beforeEach } from "vitest";
import {
  registerCommand,
  registerCommands,
  getCommands,
  getCommand,
  clearCommands,
  type Command,
  type CommandContext
} from "@/commands/registry";

function makeCtx(over: Partial<CommandContext> = {}): CommandContext {
  return {
    editor: undefined,
    notes: {} as CommandContext["notes"],
    auth: {} as CommandContext["auth"],
    shell: {} as CommandContext["shell"],
    sync: {} as CommandContext["sync"],
    updater: {} as CommandContext["updater"],
    closePalette: () => {},
    ...over
  };
}

function cmd(id: string, over: Partial<Command> = {}): Command {
  return { id, title: id, group: "app", run: () => {}, ...over };
}

describe("command registry", () => {
  beforeEach(() => clearCommands());

  it("registers and retrieves a command by id", () => {
    registerCommand(cmd("a", { title: "Alpha" }));
    expect(getCommand("a")?.title).toBe("Alpha");
    expect(getCommand("missing")).toBeUndefined();
  });

  it("registerCommands adds many at once", () => {
    registerCommands([cmd("a"), cmd("b"), cmd("c")]);
    expect(getCommands().map((c) => c.id).sort()).toEqual(["a", "b", "c"]);
  });

  it("overwrites by id (dedup, safe under re-import/HMR)", () => {
    registerCommand(cmd("a", { title: "old" }));
    registerCommand(cmd("a", { title: "new" }));
    expect(getCommands()).toHaveLength(1);
    expect(getCommand("a")?.title).toBe("new");
  });

  it("clearCommands empties the registry", () => {
    registerCommands([cmd("a"), cmd("b")]);
    clearCommands();
    expect(getCommands()).toEqual([]);
  });

  it("runs the command handler with the context", () => {
    let received: CommandContext | null = null;
    registerCommand(cmd("a", { run: (ctx) => (received = ctx) }));
    const ctx = makeCtx();
    getCommand("a")!.run(ctx);
    expect(received).toBe(ctx);
  });

  it("respects the when predicate (true → present, false → still registered but caller filters)", () => {
    // `when` is advisory; the registry stores the command regardless. The
    // palette store filters by `when` — here we only assert the predicate is
    // stored + invoked.
    let calledWith: { editor?: unknown } | null = null;
    registerCommand(
      cmd("a", {
        when: (ctx) => {
          calledWith = ctx;
          return !!ctx.editor;
        }
      })
    );
    const pred = getCommand("a")!.when!;
    expect(pred(makeCtx({ editor: undefined }))).toBe(false);
    expect(pred(makeCtx({ editor: {} as CommandContext["editor"] }))).toBe(true);
    expect(calledWith).not.toBeNull();
  });
});