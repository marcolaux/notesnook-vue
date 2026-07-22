// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import {
  buildReminderInput,
  buildReminderSchedule,
  sortRemindersByCreatedDesc,
  sortRemindersByUpcoming,
  REMINDER_PRIORITIES,
  REMINDER_MODES,
  RECURRING_MODES,
  type ReminderInput
} from "@/utils/reminders";
import { useRemindersStore } from "@/stores/reminders";
import { useReminderDialogStore } from "@/stores/reminder-dialog";
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
  },
  // Fake reminder↔note relations + note lookup for the noteLinks feature.
  // `relationsRows` holds raw {fromId,fromType,toId,toType}; `to(refs,"note").get()`
  // returns rows whose from is in refs (single id or `ids[]`) + toType matches.
  _relationsRows: [] as { fromId: string; fromType: string; toId: string; toType: string }[],
  relations: {
    add: vi.fn(async (from: { id: string; type: string }, to: { id: string; type: string }) => {
      db._relationsRows.push({ fromId: from.id, fromType: from.type, toId: to.id, toType: to.type });
    }),
    to: vi.fn((from: { type: string; id?: string; ids?: string[] }, type: string) => ({
      get: async () =>
        db._relationsRows.filter(
          (r) =>
            r.toType === type &&
            r.fromType === from.type &&
            (from.ids ? from.ids.includes(r.fromId) : r.fromId === from.id)
        )
    }))
  },
  notes: {
    note: vi.fn(async (id: string) => ({ id, title: `Note ${id}` }))
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
    db._relationsRows = [];
    db.reminders.all.items.mockClear();
    db.reminders.reminder.mockClear();
    db.reminders.add.mockClear();
    db.reminders.remove.mockClear();
    db.relations.add.mockClear();
    db.relations.to.mockClear();
    db.notes.note.mockClear();
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

  it("add with noteId links the new reminder to the note via db.relations.add", async () => {
    const s = useRemindersStore();
    const id = await s.add({ title: "Remind", date: 5000, mode: "once", noteId: "note-7" });
    expect(typeof id).toBe("string");
    expect(db.relations.add).toHaveBeenCalledWith(
      { type: "reminder", id },
      { type: "note", id: "note-7" }
    );
  });

  it("add without noteId does NOT call db.relations.add", async () => {
    const s = useRemindersStore();
    await s.add({ title: "Plain", date: 5000, mode: "once" });
    expect(db.relations.add).not.toHaveBeenCalled();
  });

  it("refresh builds noteLinks from reminder↔note relations + note titles", async () => {
    db.reminders._store.set(
      "r1",
      fakeReminder({ id: "r1", title: "R1", date: 5, mode: "once", dateCreated: 10 })
    );
    db._relationsRows.push({ fromId: "r1", fromType: "reminder", toId: "note-9", toType: "note" });
    const s = useRemindersStore();
    await s.refresh();
    expect(db.relations.to).toHaveBeenCalledWith(
      { type: "reminder", ids: ["r1"] },
      "note"
    );
    expect(s.noteLinks["r1"]).toEqual({ noteId: "note-9", title: "Note note-9" });
    expect(s.noteIdMap["r1"]).toBe("note-9");
  });

  it("refresh leaves noteLinks empty for standalone reminders", async () => {
    db.reminders._store.set(
      "r2",
      fakeReminder({ id: "r2", title: "R2", date: 5, mode: "once", dateCreated: 10 })
    );
    const s = useRemindersStore();
    await s.refresh();
    expect(s.noteLinks["r2"]).toBeUndefined();
    expect(Object.keys(s.noteIdMap)).toEqual([]);
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

describe("buildReminderSchedule", () => {
  // `isReminderActive` + `getUpcomingReminderTime` read the real `Date.now()`,
  // so all dates are relative to `realNow` (like the activeItems store test).
  const realNow = Date.now();

  it("schedules a future once-reminder at its date", () => {
    const r = fakeReminder({ id: "a", title: "A", date: realNow + 60_000, mode: "once" });
    const out = buildReminderSchedule([r], realNow);
    expect(out).toEqual([{ id: "a", title: "A", fireAt: realNow + 60_000 }]);
  });

  it("excludes past once-reminders (not active) and disabled ones", () => {
    const past = fakeReminder({ id: "p", title: "P", date: realNow - 60_000, mode: "once" });
    const disabled = fakeReminder({ id: "d", title: "D", date: realNow + 60_000, mode: "once", disabled: true });
    const future = fakeReminder({ id: "f", title: "F", date: realNow + 60_000, mode: "once" });
    const out = buildReminderSchedule([past, disabled, future], realNow);
    expect(out.map((s) => s.id)).toEqual(["f"]);
  });

  it("excludes permanent reminders (no fire time)", () => {
    const perm = fakeReminder({ id: "perm", title: "Ongoing", date: realNow + 1000, mode: "permanent" });
    expect(buildReminderSchedule([perm], realNow)).toEqual([]);
  });

  it("a snoozed once-reminder fires at snoozeUntil (not the past date)", () => {
    const r = fakeReminder({
      id: "s",
      title: "S",
      date: realNow - 60_000,
      mode: "once",
      snoozeUntil: realNow + 120_000
    });
    const out = buildReminderSchedule([r], realNow);
    expect(out).toEqual([{ id: "s", title: "S", fireAt: realNow + 120_000 }]);
  });

  it("a daily repeat reminder fires at the next occurrence (future)", () => {
    const r = fakeReminder({
      id: "rep",
      title: "R",
      date: realNow - 90_000, // already passed → next is tomorrow's slot
      mode: "repeat",
      recurringMode: "day"
    });
    const out = buildReminderSchedule([r], realNow);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("rep");
    expect(out[0].fireAt).toBeGreaterThan(realNow);
  });

  it("drops entries whose computed fireAt is in the past", () => {
    // A once-reminder whose date is in the past is inactive → excluded; but
    // guard the explicit `fireAt <= now` drop too by passing `now` ahead of a
    // future once-date.
    const r = fakeReminder({ id: "a", title: "A", date: realNow + 60_000, mode: "once" });
    expect(buildReminderSchedule([r], realNow + 120_000)).toEqual([]);
  });

  it("includes description when present, omits the key when absent", () => {
    const withDesc = fakeReminder({ id: "a", title: "A", date: realNow + 60_000, mode: "once", description: "note" });
    const noDesc = fakeReminder({ id: "b", title: "B", date: realNow + 60_000, mode: "once" });
    const out = buildReminderSchedule([withDesc, noDesc], realNow);
    expect(out[0].description).toBe("note");
    expect("description" in out[1]).toBe(false);
  });

  it("attaches noteId from the noteLinks map, omits it when absent", () => {
    const linked = fakeReminder({ id: "a", title: "A", date: realNow + 60_000, mode: "once" });
    const standalone = fakeReminder({ id: "b", title: "B", date: realNow + 60_000, mode: "once" });
    const out = buildReminderSchedule([linked, standalone], realNow, { a: "note-42" });
    expect(out[0].noteId).toBe("note-42");
    expect("noteId" in out[1]).toBe(false);
  });

  it("omits noteId for a reminder whose link isn't in the map", () => {
    const r = fakeReminder({ id: "x", title: "X", date: realNow + 60_000, mode: "once" });
    const out = buildReminderSchedule([r], realNow, { other: "note-1" });
    expect("noteId" in out[0]).toBe(false);
  });

  it("sortRemindersByUpcoming orders soonest-first, inactive last", () => {
    const soon = fakeReminder({ id: "soon", title: "S", date: realNow + 60_000, mode: "once" });
    const later = fakeReminder({ id: "later", title: "L", date: realNow + 600_000, mode: "once" });
    const past = fakeReminder({ id: "past", title: "P", date: realNow - 60_000, mode: "once" });
    const sorted = sortRemindersByUpcoming([past, later, soon], realNow);
    // active soonest first, then later; past (inactive) last.
    expect(sorted.map((r) => r.id)).toEqual(["soon", "later", "past"]);
  });
});

describe("useReminderDialogStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("openCreate seeds defaults + confirm returns a create input (no id)", async () => {
    const d = useReminderDialogStore();
    const p = d.openCreate();
    expect(d.open).toBe(true);
    expect(d.mode).toBe("create");
    expect(d.editingId).toBeNull();
    d.setTitle("Water plants");
    d.confirm();
    const input = await p;
    expect(input).not.toBeNull();
    expect(input!.id).toBeUndefined();
    expect(input!.title).toBe("Water plants");
    expect(input!.mode).toBe("once");
    expect(input!.priority).toBe("vibrate");
    expect(input!.localOnly).toBe(false);
    expect("recurringMode" in (input as object)).toBe(false);
    expect("selectedDays" in (input as object)).toBe(false);
    expect(d.open).toBe(false);
  });

  it("confirm with an empty title resolves null (treated as cancel)", async () => {
    const d = useReminderDialogStore();
    const p = d.openCreate();
    d.setTitle("   ");
    d.confirm();
    expect(await p).toBeNull();
    expect(d.open).toBe(false);
  });

  it("cancel resolves null + closes", async () => {
    const d = useReminderDialogStore();
    const p = d.openCreate();
    d.cancel();
    expect(await p).toBeNull();
    expect(d.open).toBe(false);
  });

  it("openEdit seeds from a reminder + confirm returns an edit input with id", async () => {
    const realNow = Date.now();
    const r = fakeReminder({
      id: "r1",
      title: "Standup",
      date: realNow + 3_600_000,
      mode: "repeat",
      recurringMode: "week",
      selectedDays: [1, 3],
      priority: "urgent",
      localOnly: true,
      dateCreated: 10
    });
    const d = useReminderDialogStore();
    const p = d.openEdit(r);
    expect(d.mode).toBe("edit");
    expect(d.editingId).toBe("r1");
    expect(d.title).toBe("Standup");
    expect(d.reminderMode).toBe("repeat");
    expect(d.priority).toBe("urgent");
    expect(d.selectedDays).toEqual([1, 3]);
    expect(d.localOnly).toBe(true);
    d.confirm();
    const input = await p;
    expect(input).not.toBeNull();
    expect(input!.id).toBe("r1");
    expect(input!.mode).toBe("repeat");
    expect(input!.recurringMode).toBe("week");
    expect(input!.selectedDays).toEqual([1, 3]);
    expect(input!.priority).toBe("urgent");
    expect(input!.localOnly).toBe(true);
  });

  it("a repeat reminder with no selected days omits the selectedDays key", async () => {
    const d = useReminderDialogStore();
    const p = d.openCreate();
    d.setTitle("Daily stand");
    d.setReminderMode("repeat");
    d.setRecurringMode("day");
    // selectedDays stays []
    d.confirm();
    const input = await p;
    expect(input!.mode).toBe("repeat");
    expect(input!.recurringMode).toBe("day");
    expect("selectedDays" in (input as object)).toBe(false);
  });

  it("openCreateForNote seeds title + nn:// description + noteId, and confirm carries noteId", async () => {
    const d = useReminderDialogStore();
    const p = d.openCreateForNote("note-42", "My note");
    expect(d.open).toBe(true);
    expect(d.mode).toBe("create");
    expect(d.title).toBe("My note");
    expect(d.description).toBe("nn://note/note-42");
    expect(d.linkedNoteTitle).toBe("My note");
    d.confirm();
    const input = await p;
    expect(input).not.toBeNull();
    expect(input!.noteId).toBe("note-42");
    expect(input!.title).toBe("My note");
    expect(input!.description).toBe("nn://note/note-42");
  });

  it("openCreate (after a note-linked open) resets noteId so it doesn't leak", async () => {
    const d = useReminderDialogStore();
    let p = d.openCreateForNote("note-1", "N1");
    d.cancel();
    await p;
    p = d.openCreate();
    expect(d.linkedNoteTitle).toBeUndefined();
    d.setTitle("Standalone");
    d.confirm();
    const input = await p;
    expect(input!.noteId).toBeUndefined();
    expect("noteId" in (input as object)).toBe(false);
  });

  it("openEdit leaves noteId unset (editing preserves the existing relation)", async () => {
    const realNow = Date.now();
    const r = fakeReminder({ id: "r1", title: "Standup", date: realNow + 3_600_000, mode: "once", dateCreated: 10 });
    const d = useReminderDialogStore();
    const p = d.openEdit(r);
    expect(d.linkedNoteTitle).toBeUndefined();
    d.confirm();
    const input = await p;
    expect(input!.id).toBe("r1");
    expect("noteId" in (input as object)).toBe(false);
  });
});