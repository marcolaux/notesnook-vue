// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import {
  buildReminderInput,
  sortRemindersByCreatedDesc,
  REMINDER_PRIORITIES,
  REMINDER_MODES,
  RECURRING_MODES,
  type ReminderInput
} from "@/utils/reminders";
import { useRemindersStore } from "@/stores/reminders";
import type { Reminder } from "@notesnook-vue/contracts";

// In-memory fake db.reminders: a Map<id, Reminder> backs `all.items()` /
// `reminder(id)`; `add` upserts (merges by id + applies core's defaults, so the
// real `isReminderActive` imported via contracts filters correctly); `remove`
// deletes. `isReminderActive` is the REAL core helper re-exported by contracts,
// so fake reminders carry the full BaseItem shape (type/dateCreated/...).
let clock = 1_000_000;
const now = () => clock;

function fakeReminder(p: Partial<Reminder> & Pick<Reminder, "id" | "title" | "date" | "mode">): Reminder {
  return {
    id: p.id,
    type: "reminder",
    dateCreated: p.dateCreated ?? now(),
    dateModified: p.dateModified ?? now(),
    title: p.title,
    description: p.description,
    date: p.date,
    mode: p.mode,
    priority: p.priority ?? "vibrate",
    recurringMode: p.recurringMode,
    selectedDays: p.selectedDays ?? [],
    localOnly: p.localOnly,
    disabled: p.disabled,
    snoozeUntil: p.snoozeUntil
  } as Reminder;
}

const db = {
  reminders: {
    _store: new Map<string, Reminder>(),
    all: { items: vi.fn(async () => Array.from(db.reminders._store.values())) },
    reminder: vi.fn(async (id: string) => db.reminders._store.get(id)),
    add: vi.fn(async (input: Partial<Reminder>) => {
      const id = (input.id as string) || `r${db.reminders._store.size + 1}`;
      const old = db.reminders._store.get(id);
      const merged = {
        ...(old ?? {}),
        ...Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)),
        id,
        type: "reminder" as const,
        dateCreated: old?.dateCreated ?? now(),
        dateModified: now()
      };
      merged.mode ??= "once";
      merged.priority ??= "vibrate";
      merged.selectedDays ??= [];
      db.reminders._store.set(id, merged as Reminder);
      return id;
    }),
    remove: vi.fn(async (...ids: string[]) => {
      for (const id of ids) db.reminders._store.delete(id);
    })
  }
};
vi.mock("@/platform/bootstrap", () => ({
  getDatabase: () => db,
  bootstrap: vi.fn()
}));

describe("pure helpers", () => {
  it("const arrays cover the full Reminder enum surface", () => {
    expect(REMINDER_PRIORITIES).toEqual(["silent", "vibrate", "urgent"]);
    expect(REMINDER_MODES).toEqual(["repeat", "once", "permanent"]);
    expect(RECURRING_MODES).toEqual(["week", "month", "day", "year"]);
  });

  it("buildReminderInput strips undefined keys (exactOptional-safe)", () => {
    const input: ReminderInput = {
      title: "Take out trash",
      date: 5000,
      description: undefined,
      snoozeUntil: undefined
    };
    const out = buildReminderInput(input);
    expect(out).toEqual({ title: "Take out trash", date: 5000 });
    expect("description" in out).toBe(false);
    expect("snoozeUntil" in out).toBe(false);
  });

  it("buildReminderInput carries only the defined keys of an edit patch", () => {
    const out = buildReminderInput({ id: "r1", snoozeUntil: 9000 });
    expect(out).toEqual({ id: "r1", snoozeUntil: 9000 });
  });

  it("buildReminderInput applies no defaults (core owns them)", () => {
    const out = buildReminderInput({ title: "x", date: 1 });
    expect("mode" in out).toBe(false);
    expect("priority" in out).toBe(false);
    expect("selectedDays" in out).toBe(false);
  });

  it("sortRemindersByCreatedDesc is newest-first, non-mutating, stable", () => {
    const a = fakeReminder({ id: "a", title: "A", date: 1, mode: "once", dateCreated: 10 });
    const b = fakeReminder({ id: "b", title: "B", date: 1, mode: "once", dateCreated: 90 });
    const c = fakeReminder({ id: "c", title: "C", date: 1, mode: "once", dateCreated: 50 });
    const arr = [a, b, c];
    const sorted = sortRemindersByCreatedDesc(arr);
    expect(sorted.map((r) => r.id)).toEqual(["b", "c", "a"]);
    expect(arr.map((r) => r.id)).toEqual(["a", "b", "c"]);
  });
});

describe("useRemindersStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    clock = 1_000_000;
    db.reminders._store.clear();
    db.reminders.all.items.mockClear();
    db.reminders.reminder.mockClear();
    db.reminders.add.mockClear();
    db.reminders.remove.mockClear();
  });

  it("starts empty", () => {
    const s = useRemindersStore();
    expect(s.items).toEqual([]);
    expect(s.count).toBe(0);
    expect(s.activeItems).toEqual([]);
    expect(s.lastError).toBeNull();
    expect(s.busy).toBe(false);
  });

  it("refresh loads all reminders newest-created-first", async () => {
    clock = 100;
    db.reminders._store.set("a", fakeReminder({ id: "a", title: "A", date: 5, mode: "once", dateCreated: 10 }));
    clock = 200;
    db.reminders._store.set("b", fakeReminder({ id: "b", title: "B", date: 5, mode: "once", dateCreated: 90 }));
    const s = useRemindersStore();
    await s.refresh();
    expect(db.reminders.all.items).toHaveBeenCalled();
    expect(s.items.map((r) => r.id)).toEqual(["b", "a"]);
    expect(s.loading).toBe(false);
  });

  it("activeItems filters via the real isReminderActive (disabled / past-once excluded)", async () => {
    // `isReminderActive` compares `date` against the real `Date.now()`; only
    // `dateCreated` (for sort order) is driven by the fake `clock`.
    clock = 5_000_000;
    const realNow = Date.now();
    db.reminders._store.set(
      "active",
      fakeReminder({ id: "active", title: "A", date: realNow + 1000, mode: "once", dateCreated: 10 })
    );
    db.reminders._store.set(
      "past",
      fakeReminder({ id: "past", title: "P", date: realNow - 1000, mode: "once", dateCreated: 9 })
    );
    db.reminders._store.set(
      "disabled",
      fakeReminder({ id: "disabled", title: "D", date: realNow + 1000, mode: "once", disabled: true, dateCreated: 8 })
    );
    db.reminders._store.set(
      "repeat",
      fakeReminder({ id: "repeat", title: "R", date: realNow - 1000, mode: "repeat", recurringMode: "day", dateCreated: 7 })
    );
    const s = useRemindersStore();
    await s.refresh();
    expect(s.activeItems.map((r) => r.id).sort()).toEqual(["active", "repeat"]);
  });

  it("add calls db.reminders.add + reloads + returns the id", async () => {
    const s = useRemindersStore();
    const id = await s.add({ title: "New", date: 5000, mode: "once" });
    expect(db.reminders.add).toHaveBeenCalled();
    expect(typeof id).toBe("string");
    expect(s.items.map((r) => r.title)).toContain("New");
    expect(s.lastError).toBeNull();
    expect(s.busy).toBe(false);
  });

  it("add returns null + sets lastError when core rejects (missing title)", async () => {
    db.reminders.add.mockRejectedValueOnce(new Error("date and title are required in a reminder."));
    const s = useRemindersStore();
    const id = await s.add({ date: 5000 });
    expect(id).toBeNull();
    expect(s.lastError).toContain("title");
    expect(s.busy).toBe(false);
  });

  it("remove no-ops on empty + reloads otherwise", async () => {
    const s = useRemindersStore();
    await s.remove([]);
    expect(db.reminders.remove).not.toHaveBeenCalled();
    db.reminders._store.set("a", fakeReminder({ id: "a", title: "A", date: 5, mode: "once", dateCreated: 10 }));
    await s.refresh();
    await s.remove(["a"]);
    expect(db.reminders.remove).toHaveBeenCalledWith("a");
    expect(s.items.map((r) => r.id)).not.toContain("a");
  });

  it("remove never throws + sets lastError when core rejects", async () => {
    db.reminders.remove.mockRejectedValueOnce(new Error("boom"));
    const s = useRemindersStore();
    await s.remove(["a"]);
    expect(s.lastError).toBe("boom");
    expect(s.busy).toBe(false);
  });

  it("snooze upserts {id, snoozeUntil} + reloads", async () => {
    db.reminders._store.set("a", fakeReminder({ id: "a", title: "A", date: 5, mode: "once", dateCreated: 10 }));
    const s = useRemindersStore();
    await s.refresh();
    await s.snooze("a", 99999);
    expect(db.reminders.add).toHaveBeenCalledWith(expect.objectContaining({ id: "a", snoozeUntil: 99999 }));
    expect(s.lastError).toBeNull();
  });

  it("toggleDisabled flips the disabled flag via db.reminders.add", async () => {
    db.reminders._store.set("a", fakeReminder({ id: "a", title: "A", date: 5, mode: "once", disabled: false, dateCreated: 10 }));
    const s = useRemindersStore();
    await s.refresh();
    await s.toggleDisabled("a");
    expect(db.reminders.reminder).toHaveBeenCalledWith("a");
    expect(db.reminders.add).toHaveBeenCalledWith(expect.objectContaining({ id: "a", disabled: true }));
    expect(s.lastError).toBeNull();
  });

  it("toggleDisabled sets lastError when the reminder is gone", async () => {
    db.reminders.reminder.mockResolvedValueOnce(undefined);
    const s = useRemindersStore();
    await s.toggleDisabled("ghost");
    expect(s.lastError).toContain("not found");
    expect(db.reminders.add).not.toHaveBeenCalled();
  });

  it("toggleDisabled never throws + sets lastError when add rejects", async () => {
    db.reminders._store.set("a", fakeReminder({ id: "a", title: "A", date: 5, mode: "once", dateCreated: 10 }));
    db.reminders.add.mockRejectedValueOnce(new Error("write failed"));
    const s = useRemindersStore();
    await s.toggleDisabled("a");
    expect(s.lastError).toBe("write failed");
    expect(s.busy).toBe(false);
  });

  it("update merges a patch via db.reminders.add + reloads", async () => {
    db.reminders._store.set("a", fakeReminder({ id: "a", title: "A", date: 5, mode: "once", dateCreated: 10 }));
    const s = useRemindersStore();
    await s.refresh();
    await s.update("a", { title: "A2", priority: "urgent" });
    expect(db.reminders.add).toHaveBeenCalledWith(expect.objectContaining({ id: "a", title: "A2", priority: "urgent" }));
    expect(s.lastError).toBeNull();
  });

  it("refresh never throws + leaves the previous list intact on failure", async () => {
    db.reminders._store.set("a", fakeReminder({ id: "a", title: "A", date: 5, mode: "once", dateCreated: 10 }));
    const s = useRemindersStore();
    await s.refresh();
    expect(s.items).toHaveLength(1);
    db.reminders.all.items.mockRejectedValueOnce(new Error("db down"));
    await s.refresh();
    expect(s.items).toHaveLength(1);
    expect(s.loading).toBe(false);
  });
});