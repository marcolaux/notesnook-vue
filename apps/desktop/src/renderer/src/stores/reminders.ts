import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { getDatabase } from "@/platform/bootstrap";
import { isReminderActive } from "@notesnook-vue/contracts";
import type { Reminder } from "@notesnook-vue/contracts";
import {
  buildReminderInput,
  sortRemindersByCreatedDesc,
  type ReminderInput
} from "@/utils/reminders";

/**
 * Reminders store (headless) — the reminders list + create / edit / snooze /
 * delete actions, backed by `@notesnook/core`'s `db.reminders`. A `Reminder` is
 * a top-level collection item (the "reminders" grouping), not attached to a
 * note: `title`, `description`, `date`, `mode` (`once`/`repeat`/`permanent`),
 * `priority`, and (for `repeat`) `recurringMode` + `selectedDays`.
 *
 * Request/response (no event-subscribe, like the sync-control + note-history
 * stores) → isolated testable. `db.reminders.add` upserts by id, so create and
 * edit (snooze, toggle-disabled, generic update) all flow through it. The
 * future RemindersView calls `refresh()` on mount; OS-notification scheduling
 * is a main-process on-site follow-up (like tray/updater).
 *
 * `activeItems` filters `items` with core's pure `isReminderActive` (disabled,
 * or `once` whose `date` has passed and is not snoozed, are inactive). It is
 * correct at refresh time; the on-site view re-evaluates on a clock tick.
 */

export const useRemindersStore = defineStore("reminders", () => {
  /** All (non-deleted) reminders, newest-created-first. */
  const items = ref<Reminder[]>([]);
  /** True while the list is being (re)loaded. */
  const loading = ref(false);
  /** True while a create/edit/delete mutation is in flight. */
  const busy = ref(false);
  /** Last mutation error message, or `null`. Cleared on success. */
  const lastError = ref<string | null>(null);

  /** Per-reminder linked-note meta (reminderId → { noteId, title }), built in
   *  `refresh()` from the reminder↔note relations (`db.relations`). A reminder
   *  is standalone in core (no noteId field); the link is a relation. The
   *  Reminders view renders a clickable note-title chip from this; the
   *  scheduler reads `noteIdMap` (derived below) to thread `noteId` to main so
   *  the notification `click` opens the note. */
  const noteLinks = ref<Record<string, { noteId: string; title: string }>>({});
  /** reminderId → noteId (derived from `noteLinks`) for the scheduler mapper. */
  const noteIdMap = computed<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(noteLinks.value)) out[k] = v.noteId;
    return out;
  });

  const count = computed(() => items.value.length);
  /** Active reminders (core's `isReminderActive` — disabled / past-once excluded). */
  const activeItems = computed(() => items.value.filter(isReminderActive));

  /** Reload the reminder list from the database, newest-created-first, and
   *  rebuild the reminder↔note link map. Never throws — a failure leaves the
   *  previous list intact and logs. `noteLinks` is assigned BEFORE `items` so
   *  the scheduler watch (on `items`) sees a consistent pair when it fires. */
  async function refresh(): Promise<void> {
    loading.value = true;
    try {
      const db = getDatabase();
      const all: Reminder[] = await db.reminders.all.items();
      const sorted = sortRemindersByCreatedDesc(all);
      const links: Record<string, { noteId: string; title: string }> = {};
      if (sorted.length > 0) {
        try {
          const rows = await db.relations
            .to({ type: "reminder", ids: sorted.map((r) => r.id) }, "note")
            .get();
          const relRows = rows as { fromId: string; toId: string }[];
          const noteIds = [...new Set(relRows.map((r) => r.toId))];
          const titles = new Map<string, string>();
          await Promise.all(
            noteIds.map(async (nid) => {
              try {
                const n = await db.notes.note(nid);
                if (n) titles.set(nid, n.title || "Untitled");
              } catch {
                /* note gone — skip */
              }
            })
          );
          for (const row of relRows) {
            links[row.fromId] = {
              noteId: row.toId,
              title: titles.get(row.toId) ?? "Untitled"
            };
          }
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error("[reminders] noteLinks load failed:", e);
        }
      }
      noteLinks.value = links;
      items.value = sorted;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[reminders] refresh failed:", e);
    } finally {
      loading.value = false;
    }
  }

  /**
   * Create a reminder via `db.reminders.add`, then reload. Returns the new id,
   * or `null` if the call threw (error surfaced via `lastError`). Core requires
   * `title` + `date` on create (throws otherwise — caught here). `busy`-gated.
   *
   * If `input.noteId` is set, links the new reminder to that note via
   * `db.relations.add` (reminder↔note). The relation is idempotent (core
   * generates the relation id from from+to) and a link failure is logged but
   * does NOT fail the add — the reminder exists either way.
   */
  async function add(input: ReminderInput): Promise<string | null> {
    busy.value = true;
    try {
      const db = getDatabase();
      const id = await db.reminders.add(buildReminderInput(input));
      if (id && input.noteId) {
        try {
          await db.relations.add(
            { type: "reminder", id },
            { type: "note", id: input.noteId }
          );
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error("[reminders] link reminder→note failed:", e);
        }
      }
      lastError.value = null;
      await refresh();
      return id ?? null;
    } catch (e) {
      lastError.value = e instanceof Error ? e.message : String(e);
      // eslint-disable-next-line no-console
      console.error("[reminders] add failed:", e);
      return null;
    } finally {
      busy.value = false;
    }
  }

  /** Delete reminders by id (soft-delete in core). Never throws; no-op on empty. */
  async function remove(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    busy.value = true;
    try {
      const db = getDatabase();
      await db.reminders.remove(...ids);
      lastError.value = null;
      await refresh();
    } catch (e) {
      lastError.value = e instanceof Error ? e.message : String(e);
      // eslint-disable-next-line no-console
      console.error("[reminders] remove failed:", e);
    } finally {
      busy.value = false;
    }
  }

  /** Snooze a reminder until `untilMs` (upserts `{id, snoozeUntil}`). Never throws. */
  async function snooze(id: string, untilMs: number): Promise<void> {
    await update(id, { snoozeUntil: untilMs });
  }

  /** Flip a reminder's `disabled` flag (upserts via `db.reminders.add`). Never
   *  throws; sets `lastError` if the reminder no longer exists. */
  async function toggleDisabled(id: string): Promise<void> {
    busy.value = true;
    try {
      const db = getDatabase();
      const r = await db.reminders.reminder(id);
      if (!r) {
        lastError.value = "Reminder not found.";
        return;
      }
      await db.reminders.add(buildReminderInput({ id, disabled: !r.disabled }));
      lastError.value = null;
      await refresh();
    } catch (e) {
      lastError.value = e instanceof Error ? e.message : String(e);
      // eslint-disable-next-line no-console
      console.error("[reminders] toggleDisabled failed:", e);
    } finally {
      busy.value = false;
    }
  }

  /** Apply a partial patch to a reminder (upserts via `db.reminders.add`).
   *  Generic edit covering snooze + any field change; never throws. */
  async function update(id: string, patch: Partial<ReminderInput>): Promise<void> {
    busy.value = true;
    try {
      const db = getDatabase();
      await db.reminders.add(buildReminderInput({ id, ...patch }));
      lastError.value = null;
      await refresh();
    } catch (e) {
      lastError.value = e instanceof Error ? e.message : String(e);
      // eslint-disable-next-line no-console
      console.error("[reminders] update failed:", e);
    } finally {
      busy.value = false;
    }
  }

  return {
    items,
    loading,
    busy,
    lastError,
    count,
    activeItems,
    noteLinks,
    noteIdMap,
    refresh,
    add,
    remove,
    snooze,
    toggleDisabled,
    update
  };
});