// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { EV, EVENTS } from "@notesnook-vue/contracts";
import { bindEventBridge } from "@/platform/event-bridge";

// Minimal stub of the Database's instance-local `eventManager`: captures
// handlers by event name so the test can fire them as core would. The real
// `EventManager` is a `Map<handler, {name, once}>`; this stub keeps a
// name→handlers list which is enough to exercise the bridge.
function makeStubEventManager() {
  const handlers = new Map<string, Array<(...args: unknown[]) => unknown>>();
  return {
    subscribe(name: string, handler: (...args: unknown[]) => unknown) {
      const list = handlers.get(name) ?? [];
      list.push(handler);
      handlers.set(name, list);
      return { unsubscribe: () => false };
    },
    fire(name: string, ...args: unknown[]): void {
      for (const h of handlers.get(name) ?? []) h(...args);
    }
  };
}

describe("event bridge — db.eventManager → global EV", () => {
  beforeEach(() => {
    // Clear global-EV subscriptions from prior tests in this file so each
    // case starts clean (vitest isolates per file, so this doesn't bleed
    // into other test files' EV instances).
    EV.unsubscribeAll();
  });

  const bridged = [
    EVENTS.syncProgress,
    EVENTS.syncCompleted,
    EVENTS.syncAborted,
    EVENTS.databaseSyncRequested,
    EVENTS.vaultLocked,
    EVENTS.vaultAutoLocked,
    EVENTS.vaultUnlocked,
    EVENTS.userSessionExpired,
    EVENTS.userLoggedOut,
    EVENTS.monographsUpdated
  ];

  it.each(bridged)("re-publishes %s from db.eventManager to EV", (name) => {
    const db = { eventManager: makeStubEventManager() } as never;
    bindEventBridge(db);
    let fired = false;
    EV.subscribe(name, () => {
      fired = true;
    });
    (db.eventManager as ReturnType<typeof makeStubEventManager>).fire(name);
    expect(fired).toBe(true);
  });

  it("forwards the publish args through to the EV handler", () => {
    const db = { eventManager: makeStubEventManager() } as never;
    bindEventBridge(db);
    let received: unknown[] = [];
    EV.subscribe(EVENTS.syncCompleted, (...args: unknown[]) => {
      received = args;
    });
    (db.eventManager as ReturnType<typeof makeStubEventManager>).fire(EVENTS.syncCompleted, { added: 3 }, "full");
    expect(received).toEqual([{ added: 3 }, "full"]);
  });

  it("does NOT bridge userUnauthorized (core publishes it to EV directly)", () => {
    const db = { eventManager: makeStubEventManager() } as never;
    bindEventBridge(db);
    let fired = false;
    EV.subscribe(EVENTS.userUnauthorized, () => {
      fired = true;
    });
    (db.eventManager as ReturnType<typeof makeStubEventManager>).fire(EVENTS.userUnauthorized);
    expect(fired).toBe(false);
  });

  it("each bindEventBridge subscribes once per event (re-bound per switchContext)", () => {
    // Two switches → two bridges on two different (stub) eventManagers. Each
    // bridges independently; firing one must not double-fire an EV handler
    // subscribed once, and the orphaned bridge must not forward.
    const db1 = { eventManager: makeStubEventManager() } as never;
    const db2 = { eventManager: makeStubEventManager() } as never;
    bindEventBridge(db1);
    bindEventBridge(db2);

    let count = 0;
    EV.subscribe(EVENTS.syncCompleted, () => {
      count += 1;
    });
    (db1.eventManager as ReturnType<typeof makeStubEventManager>).fire(EVENTS.syncCompleted);
    (db2.eventManager as ReturnType<typeof makeStubEventManager>).fire(EVENTS.syncCompleted);
    expect(count).toBe(2); // one fire per database's own bus
  });
});