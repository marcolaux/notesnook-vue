/**
 * Contract tests for the account-switcher menu builder
 * (`utils/account-switcher-menu.ts`). Pure over its inputs: the caller supplies
 * the account list + current context + a translator + callbacks, and the
 * builder returns the `MenuItem[]` the sidebar's `ContextMenu` renders. The
 * per-window multi-account model depends on the menu wiring the right
 * callback per row (switch in place vs open in new window vs remove) and
 * marking the active account checked.
 */
import { describe, it, expect } from "vitest";
import {
  buildAccountSwitcherMenu,
  type AccountSwitcherCallbacks
} from "@/utils/account-switcher-menu";
import { LOCAL_CONTEXT } from "@/platform/account-context";
import type { AccountEntry } from "@contracts/server-config";

const t = (k: string): string => k;

function makeAccount(contextId: string, email: string): AccountEntry {
  return { contextId, email, serverConfig: { profile: "notesnook" }, lastUsed: 0 };
}

function collectCallbacks(): AccountSwitcherCallbacks & {
  calls: { switch: string[]; newWindow: string[]; add: number; signOut: number; remove: string[] };
} {
  const calls = { switch: [] as string[], newWindow: [] as string[], add: 0, signOut: 0, remove: [] as string[] };
  return {
    calls,
    onSwitch: (ctx) => calls.switch.push(ctx),
    onOpenInNewWindow: (ctx) => calls.newWindow.push(ctx),
    onAddAccount: () => calls.add++,
    onSignOut: () => calls.signOut++,
    onRemove: (ctx) => calls.remove.push(ctx)
  };
}

describe("buildAccountSwitcherMenu", () => {
  it("always lists Local first, checked when it is the active context", () => {
    const cb = collectCallbacks();
    const items = buildAccountSwitcherMenu({ accounts: [], currentContext: LOCAL_CONTEXT, t, callbacks: cb });
    const local = items.find((i) => i.id === "local")!;
    expect(local.label).toBe("sidebar.localOnly");
    expect(local.checked).toBe(true);
    local.onSelect!();
    expect(cb.calls.switch).toEqual([LOCAL_CONTEXT]);
  });

  it("lists each known account with a checkmark on the active one", () => {
    const cb = collectCallbacks();
    const a = makeAccount("ctx-a", "a@example.com");
    const b = makeAccount("ctx-b", "b@example.com");
    const items = buildAccountSwitcherMenu({ accounts: [a, b], currentContext: "ctx-b", t, callbacks: cb });
    const acctA = items.find((i) => i.id === "acct-ctx-a")!;
    const acctB = items.find((i) => i.id === "acct-ctx-b")!;
    expect(acctA.label).toBe("a@example.com");
    expect(acctA.checked).toBe(false);
    expect(acctB.checked).toBe(true);
    acctA.onSelect!();
    expect(cb.calls.switch).toEqual(["ctx-a"]);
  });

  it("'Open in new window' submenu lists Local + every account → onOpenInNewWindow", () => {
    const cb = collectCallbacks();
    const a = makeAccount("ctx-a", "a@example.com");
    const items = buildAccountSwitcherMenu({ accounts: [a], currentContext: LOCAL_CONTEXT, t, callbacks: cb });
    const openItem = items.find((i) => i.id === "open-new-window")!;
    expect(openItem.submenu).toBeDefined();
    const sub = openItem.submenu!.build("");
    expect(sub.map((i) => i.id)).toEqual(["new-local", "new-ctx-a"]);
    sub[1].onSelect!();
    expect(cb.calls.newWindow).toEqual(["ctx-a"]);
  });

  it("'Sign out of this account' is disabled in local mode, enabled for an account", () => {
    const cb = collectCallbacks();
    const a = makeAccount("ctx-a", "a@example.com");
    const localItems = buildAccountSwitcherMenu({ accounts: [a], currentContext: LOCAL_CONTEXT, t, callbacks: cb });
    expect(localItems.find((i) => i.id === "sign-out")!.disabled).toBe(true);
    const acctItems = buildAccountSwitcherMenu({ accounts: [a], currentContext: "ctx-a", t, callbacks: cb });
    const signOut = acctItems.find((i) => i.id === "sign-out")!;
    expect(signOut.disabled).toBe(false);
    signOut.onSelect!();
    expect(cb.calls.signOut).toBe(1);
  });

  it("'Remove account' submenu lists only NON-active accounts (danger)", () => {
    const cb = collectCallbacks();
    const a = makeAccount("ctx-a", "a@example.com");
    const b = makeAccount("ctx-b", "b@example.com");
    const items = buildAccountSwitcherMenu({ accounts: [a, b], currentContext: "ctx-a", t, callbacks: cb });
    const remove = items.find((i) => i.id === "remove-account")!;
    expect(remove.danger).toBe(true);
    const sub = remove.submenu!.build("");
    expect(sub.map((i) => i.id)).toEqual(["rm-ctx-b"]); // active account excluded
    expect(sub[0].danger).toBe(true);
    sub[0].onSelect!();
    expect(cb.calls.remove).toEqual(["ctx-b"]);
  });

  it("'Remove account' is disabled when there is no removable account", () => {
    const cb = collectCallbacks();
    const a = makeAccount("ctx-a", "a@example.com");
    const items = buildAccountSwitcherMenu({ accounts: [a], currentContext: "ctx-a", t, callbacks: cb });
    expect(items.find((i) => i.id === "remove-account")!.disabled).toBe(true);
  });

  it("'Add account' invokes onAddAccount", () => {
    const cb = collectCallbacks();
    const items = buildAccountSwitcherMenu({ accounts: [], currentContext: LOCAL_CONTEXT, t, callbacks: cb });
    items.find((i) => i.id === "add-account")!.onSelect!();
    expect(cb.calls.add).toBe(1);
  });
});