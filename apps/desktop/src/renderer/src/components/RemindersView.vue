<script setup lang="ts">
/**
 * Reminders view (on-site) — the reminders list with create / edit / snooze /
 * enable-disable / delete actions, backed by the headless `useRemindersStore`
 * (which wraps `db.reminders`). Rendered directly by `<RouterView />` in
 * ShellLayout — the root assumes a `min-h-0 flex-1 min-w-0` flex context (same
 * as TrashView).
 *
 * Reminders are a top-level Core collection (the "reminders" grouping), NOT
 * note-attached: `title`/`description`/`date`/`mode` (once/repeat/permanent)/
 * `priority`. `db.reminders.add` upserts, so create + edit both flow through
 * `reminders.add` / `reminders.update`. The OS-notification scheduling is
 * driven by a separate composable in `App.vue` (`useReminderNotifications`)
 * that watches the store; this view only does CRUD + display.
 *
 * Sorting is by upcoming fire time (soonest first), inactive reminders last —
 * a view concern via `sortRemindersByUpcoming` (core's `getUpcomingReminderTime`
 * is dayjs-heavy; re-exported via contracts). The list re-evaluates on a clock
 * tick (1 min) so relative labels ("Today, 5:00 PM") + the active/inactive
 * boundary stay fresh without a manual refresh.
 *
 * Labels are English literals (the codebase is mid-i18n — TrashView hardcodes
 * the same way; migrating these is the Phase 7.1 sweep). Destructive delete
 * uses the headless `useDialogStore.confirm` overlay (mounted once in App.vue).
 */
import { onMounted, onUnmounted, computed, ref } from "vue";
import { useRouter } from "vue-router";
import { useRemindersStore } from "@/stores/reminders";
import { useNotesStore } from "@/stores/notes";
import { useReminderDialogStore } from "@/stores/reminder-dialog";
import { useDialogStore } from "@/stores/dialog";
import { useContextMenuStore } from "@/stores/context-menu";
import { separator, type MenuItem } from "@/utils/context-menu";
import { sortRemindersByUpcoming } from "@/utils/reminders";
import { formatReminderTime } from "@notesnook-vue/contracts";
import type { Reminder } from "@notesnook-vue/contracts";

const reminders = useRemindersStore();
const notes = useNotesStore();
const reminderDialog = useReminderDialogStore();
const dialog = useDialogStore();
const contextMenu = useContextMenuStore();
const router = useRouter();

/** Open a note by id — the same deep-link path App.vue uses: route to /all
 *  (the editor-bearing view) then collapse the selection to the note. */
function openNote(noteId: string): void {
  void router.push("/all").then(() => notes.selectNote(noteId));
}

/** The note linked to `r` (via reminder↔note relation), or `undefined`. Pulled
 *  into a helper so the template can guard once with `v-if` then read the
 *  narrowed value (vue-tsc doesn't narrow a record-index access across
 *  separate expressions). */
function linkedNote(r: Reminder): { noteId: string; title: string } | undefined {
  return reminders.noteLinks[r.id];
}

/** Clock tick (1 min) so relative labels + the active/inactive boundary stay
 *  fresh. Re-evaluates the sorted list by bumping a reactive `now`. */
const now = ref(Date.now());
let clockTimer: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  void reminders.refresh();
  clockTimer = setInterval(() => void (now.value = Date.now()), 60_000);
});
onUnmounted(() => {
  if (clockTimer) clearInterval(clockTimer);
});

/** Sorted list (soonest active first, inactive last). Re-sorts on every
 *  `now` bump + store change. */
const sorted = computed<Reminder[]>(() =>
  sortRemindersByUpcoming(reminders.items, now.value)
);

/** Open the create dialog and, on confirm, add the reminder. */
async function createReminder(): Promise<void> {
  const input = await reminderDialog.openCreate();
  if (input) await reminders.add(input);
}

/** Open the edit dialog seeded from `r` and, on confirm, update it. */
async function editReminder(r: Reminder): Promise<void> {
  const input = await reminderDialog.openEdit(r);
  if (input) await reminders.update(r.id, input);
}

/** Snooze a reminder until `untilMs`. */
function snooze(r: Reminder, untilMs: number): void {
  void reminders.snooze(r.id, untilMs);
}

/** Flip a reminder's `disabled` flag. */
function toggle(r: Reminder): void {
  void reminders.toggleDisabled(r.id);
}

/** Delete a reminder (confirm-gated). */
async function deleteReminder(r: Reminder): Promise<void> {
  const ok = await dialog.confirm({
    title: "Delete reminder",
    message: `Delete “${r.title}”? This cannot be undone.`,
    confirmLabel: "Delete",
    danger: true
  });
  if (!ok) return;
  await reminders.remove([r.id]);
}

/** Right-click a row → Open note (when linked) / Edit / Snooze ▸ / Enable-Disable / Delete. */
function onRowContext(r: Reminder, e: MouseEvent): void {
  const items: MenuItem[] = [];
  const link = linkedNote(r);
  if (link) {
    items.push({
      id: "open-note",
      label: "Open note",
      onSelect: () => openNote(link.noteId)
    });
    items.push(separator("sep-open"));
  }
  items.push(
    { id: "edit", label: "Edit…", onSelect: () => void editReminder(r) },
    {
      id: "snooze",
      label: "Snooze",
      submenu: {
        build: () => [
          { id: "1h", label: "1 hour", onSelect: () => snooze(r, Date.now() + 3_600_000) },
          { id: "1d", label: "1 day", onSelect: () => snooze(r, Date.now() + 86_400_000) },
          { id: "tomorrow", label: "Until tomorrow 9am", onSelect: () => snooze(r, untilTomorrow9am()) }
        ]
      }
    },
    {
      id: "toggle",
      label: r.disabled ? "Enable" : "Disable",
      onSelect: () => toggle(r)
    },
    separator("sep"),
    {
      id: "delete",
      label: "Delete",
      danger: true,
      onSelect: () => void deleteReminder(r)
    }
  );
  contextMenu.show(items, e.clientX, e.clientY);
}

/** Next tomorrow 09:00 local. */
function untilTomorrow9am(): number {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d.getTime();
}

/** Short mode label for the row badge. */
function modeLabel(r: Reminder): string {
  if (r.mode === "permanent") return "ongoing";
  if (r.mode === "repeat") return `repeat · ${r.recurringMode ?? "day"}`;
  return "once";
}

/** Priority badge label. */
function priorityLabel(p: Reminder["priority"]): string {
  return p ?? "vibrate";
}
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col backdrop-blur-xl">
    <!-- Header: title + active count + New reminder -->
    <div class="flex h-9 shrink-0 items-center gap-2 border-b border-glass-border px-3">
      <span class="text-xs font-semibold text-text">Reminders</span>
      <span class="text-[10px] text-text-muted">{{ reminders.activeItems.length }} active · {{ reminders.count }} total</span>
      <button
        class="titlebar-no-drag ml-auto rounded-sm bg-glass-hover px-2 py-0.5 text-[10px] text-text transition-colors hover:bg-glass-active disabled:cursor-not-allowed disabled:opacity-40"
        :disabled="reminders.busy"
        title="New reminder"
        @click="createReminder()"
      >
        + New reminder
      </button>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto p-1">
      <div v-if="reminders.loading && reminders.items.length === 0" class="px-2 py-4 text-center text-[10px] text-text-muted">
        Loading…
      </div>
      <button
        v-for="r in sorted"
        :key="r.id"
        class="group block w-full rounded-md px-2 py-1.5 text-left hover:bg-glass-hover"
        :class="{ 'opacity-60': r.disabled }"
        @contextmenu.prevent="onRowContext(r, $event)"
      >
        <div class="flex items-center gap-1">
          <span class="truncate text-xs font-medium text-text">{{ r.title }}</span>
          <span v-if="r.disabled" class="shrink-0 rounded-sm bg-glass-hover px-1 text-[9px] text-text-muted">disabled</span>
          <span v-else-if="r.snoozeUntil && r.snoozeUntil > now" class="shrink-0 rounded-sm bg-amber-400/20 px-1 text-[9px] text-amber-200/80">snoozed</span>
          <span class="ml-auto flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              class="titlebar-no-drag rounded-sm px-1 py-0.5 text-[9px] text-text-muted hover:bg-glass-active hover:text-text"
              title="Edit"
              @click.stop="editReminder(r)"
            >Edit</button>
            <button
              class="titlebar-no-drag rounded-sm px-1 py-0.5 text-[9px] text-text-muted hover:bg-glass-active hover:text-text"
              title="Snooze 1 hour"
              @click.stop="snooze(r, Date.now() + 3_600_000)"
            >Snooze</button>
            <button
              class="titlebar-no-drag rounded-sm px-1 py-0.5 text-[9px] text-text-muted hover:bg-glass-active hover:text-text"
              :title="r.disabled ? 'Enable' : 'Disable'"
              @click.stop="toggle(r)"
            >{{ r.disabled ? "On" : "Off" }}</button>
            <button
              class="titlebar-no-drag rounded-sm px-1 py-0.5 text-[9px] text-rose-300/80 hover:bg-glass-active"
              title="Delete"
              @click.stop="deleteReminder(r)"
            >Delete</button>
          </span>
        </div>
        <div class="mt-0.5 flex items-center gap-1.5 text-[9px] text-text-muted">
          <span class="shrink-0 rounded-sm bg-glass-hover px-1">{{ modeLabel(r) }}</span>
          <span class="shrink-0 rounded-sm bg-glass-hover px-1">{{ priorityLabel(r.priority) }}</span>
          <span v-if="r.description" class="truncate">{{ r.description }}</span>
          <span class="ml-auto shrink-0">{{ formatReminderTime(r) }}</span>
        </div>
        <button
          v-if="linkedNote(r)"
          type="button"
          class="titlebar-no-drag mt-0.5 inline-flex max-w-full items-center gap-1 rounded-sm bg-glass-hover px-1 py-0.5 text-[9px] text-text-muted transition-colors hover:bg-glass-active hover:text-text"
          :title="`Open ${linkedNote(r)!.title}`"
          @click.stop="openNote(linkedNote(r)!.noteId)"
        >
          <span class="shrink-0">📝</span>
          <span class="truncate">{{ linkedNote(r)!.title }}</span>
        </button>
      </button>
      <div v-if="!reminders.loading && reminders.items.length === 0" class="px-2 py-4 text-center text-[10px] text-text-muted">
        No reminders — click “New reminder” to create one.
      </div>
    </div>
  </div>
</template>