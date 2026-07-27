/**
 * Account-switcher context-menu builder (pure) — the menu the sidebar's account
 * button opens. Pure over its inputs so it is headless-testable (no Vue, no db,
 * no IPC): the caller supplies the account list, the current context id, a
 * translator, and the action callbacks (`onSwitch` / `onOpenInNewWindow` /
 * `onAddAccount` / `onSignOut` / `onRemove`).
 *
 * Menu shape (v2 `ContextMenu`, one-level submenus):
 *  - Local mode (always present, checkmark when active) → `onSwitch("local")`.
 *  - One row per known account (checkmark when active) → `onSwitch(contextId)`.
 *  - "Open in new window ▸" submenu → Local + each account →
 *    `onOpenInNewWindow(contextId)` (per-window multi-account: each window is
 *    its own renderer process with its own `Database`/`Hosts`).
 *  - "Add account" → `onAddAccount` (re-arms the login screen).
 *  - "Sign out of this account" → `onSignOut` (disabled in local mode).
 *  - "Remove account… ▸" submenu → non-active accounts (danger) →
 *    `onRemove(contextId)` (destructive: deletes the account's DB + keychain).
 */
import { separator, type MenuItem } from "@/utils/context-menu";
import { LOCAL_CONTEXT } from "@/platform/account-context";
import type { AccountEntry } from "@contracts/server-config";

export interface AccountSwitcherCallbacks {
  onSwitch(contextId: string): void;
  onOpenInNewWindow(contextId: string): void;
  onAddAccount(): void;
  onSignOut(): void;
  onRemove(contextId: string): void;
}

export interface AccountSwitcherMenuInput {
  accounts: AccountEntry[];
  /** The context id of the window the menu was opened from (marks the active
   *  row + decides whether "Sign out" is enabled). */
  currentContext: string;
  t: (key: string) => string;
  callbacks: AccountSwitcherCallbacks;
}

/** Build the account-switcher menu. See the file header for the shape. */
export function buildAccountSwitcherMenu({
  accounts,
  currentContext,
  t,
  callbacks
}: AccountSwitcherMenuInput): MenuItem[] {
  const items: MenuItem[] = [
    {
      id: "local",
      label: t("sidebar.localOnly"),
      checked: currentContext === LOCAL_CONTEXT,
      onSelect: () => callbacks.onSwitch(LOCAL_CONTEXT)
    }
  ];

  if (accounts.length > 0) items.push(separator("sep-accounts"));
  for (const a of accounts) {
    items.push({
      id: `acct-${a.contextId}`,
      label: a.email,
      checked: a.contextId === currentContext,
      onSelect: () => callbacks.onSwitch(a.contextId)
    });
  }

  // "Open in new window" submenu: Local + every account. Each opens a NEW
  // full-shell window bound to that context (per-window multi-account).
  const openInNewWindowEntries: MenuItem[] = [
    {
      id: "new-local",
      label: t("sidebar.localOnly"),
      onSelect: () => callbacks.onOpenInNewWindow(LOCAL_CONTEXT)
    },
    ...accounts.map((a) => ({
      id: `new-${a.contextId}`,
      label: a.email,
      onSelect: () => callbacks.onOpenInNewWindow(a.contextId)
    }))
  ];

  items.push(separator("sep-actions"));
  items.push({
    id: "open-new-window",
    label: t("sidebar.openInNewWindow"),
    submenu: { build: () => openInNewWindowEntries }
  });
  items.push({
    id: "add-account",
    label: t("sidebar.addAccount"),
    onSelect: () => callbacks.onAddAccount()
  });
  items.push({
    id: "sign-out",
    label: t("sidebar.signOutAccount"),
    // Signing out is meaningful only for a logged-in (non-local) window.
    disabled: currentContext === LOCAL_CONTEXT,
    onSelect: () => callbacks.onSignOut()
  });

  // "Remove account" submenu: every NON-active account (the active account is
  // refused — the UI offers removal only for accounts not in this window).
  const removable = accounts.filter((a) => a.contextId !== currentContext);
  items.push({
    id: "remove-account",
    label: t("sidebar.removeAccount"),
    danger: true,
    disabled: removable.length === 0,
    submenu: {
      build: () =>
        removable.map((a) => ({
          id: `rm-${a.contextId}`,
          label: a.email,
          danger: true,
          onSelect: () => callbacks.onRemove(a.contextId)
        }))
    }
  });

  return items;
}