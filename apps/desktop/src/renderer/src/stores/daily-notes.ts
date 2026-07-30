/**
 * Daily-notes store — the backend for the "Daily Notes" sidebar mode.
 *
 * A daily note is an ordinary note carrying the reserved `"daily"` tag
 * (`DAILY_TAG_TITLE`) whose title is the ISO date (`YYYY-MM-DD`, local). This
 * store owns:
 *  - the selected date (today on entry);
 *  - lookup-or-create of the daily note for a date (find an existing daily-tagged
 *    note with the matching ISO title, else create one + attach the tag);
 *  - the set of dates that already have a daily note (timeline dots).
 *
 * Data-layer reuse (mirrors `stores/templates.ts`, which is the same "reserved
 * tag + note→tag relation" pattern):
 *  - The reserved tag is get-or-created via `db.tags.find`/`db.tags.add` (the
 *    latter THROWS on a duplicate title, so find-first and tolerate the race).
 *    Created lazily — only when a daily note is first created — so an account
 *    with no daily notes never has a stray "daily" tag in the sidebar.
 *  - The set of daily notes is the `tag → note` relation resolved via
 *    `db.relations.from({type:"tag",id},"note").resolve()` (same shape as
 *    `templates.load` / `notes.filterByCollection`).
 *  - A new daily note is created with `notes.create({ title: iso, openNote:
 *    false, content: "" })` (the same shape `note-link-bridge.createNoteForLink`
 *    uses), then tagged via `db.relations.add`.
 *
 * Per-account DB: `getDatabase()` returns the CURRENT account's db, so the db is
 * re-fetched in each function (never cached at module load). The memo + tag/daily
 * sets are invalidated on `notes.items` length change (create/delete) and on
 * `invalidate()` (account switch) so stale ids never hide a daily note created
 * elsewhere (another window / a sync pull).
 */
import { defineStore } from "pinia";
import { ref, computed, watch } from "vue";
import { getDatabase } from "@/platform/bootstrap";
import { useNotesStore } from "@/stores/notes";
import { useEditorLayoutStore } from "@/stores/editor-layout";
import { useSettingsStore } from "@/stores/settings";
import { logger } from "@/utils/logger";
import {
  DAILY_TAG_TITLE,
  attributeTasks,
  dayRange,
  isoDate,
  parseIsoDate,
  todayIso,
  type NoteTaskInput,
  type TaskAttribution
} from "@/utils/daily-notes";
import type { Note } from "@notesnook-vue/contracts";

/** A task attributed to a day — the shape the editor footer's References
 *  section lists and the aggregated `taskRefsByDate` map stores per ISO date.
 *  Re-exported from the pure helper so the section/scan share one definition. */
export type TaskMatch = TaskAttribution;

/** CSS selector for both checklist node types (rich `task-list` + simple
 *  `check-list`) — mirrors the references section's selector so the scan counts the
 *  same items the section lists. */
const CHECKLIST_SELECTOR = "li.checklist--item, li.simple-checklist--item";

export const useDailyNotesStore = defineStore("daily-notes", () => {
  const notes = useNotesStore();
  const layout = useEditorLayoutStore();

  /** Selected ISO date (today on store creation). */
  const selectedDate = ref<string>(todayIso());

  /** The reserved "daily" tag's id, resolved lazily and cached. `null` until a
   *  lookup/create actually needs it. */
  const dailyTagId = ref<string | null>(null);

  /** Memo: ISO date → daily-note id, so repeated clicks/selects don't re-query
   *  or recreate. Persisted across refreshes (only grows / is cleared on
   *  account switch). */
  const dailyNoteIdByDate = ref<Record<string, string>>({});

  /** All note ids currently tagged "daily" (the timeline dots' source). */
  const dailyNoteIds = ref<Set<string>>(new Set());

  /** ISO titles of every daily note (for the timeline dot on a given day). */
  const dailyDates = computed<Set<string>>(() => {
    const set = new Set<string>();
    for (const iso of Object.keys(dailyNoteIdByDate.value)) set.add(iso);
    return set;
  });

  /** True once {@link refreshDailyNotes} has resolved at least once. */
  let refreshed = false;

  /** The selected date that has NO daily note yet — `null` when the selected
   *  date has a daily note (or none is selected). The Daily Notes editor reads
   *  this to prefill a draft's title with the ISO date WITHOUT creating the
   *  note; the note is created (and tagged daily via {@link claimDraft}) only
   *  when the user types content. Set by the non-creating {@link openDailyNote}
   *  + cleared by {@link claimDraft} / when a daily note is opened. */
  const pendingDailyDate = ref<string | null>(null);

  /** Aggregated OPEN task references: ISO date → the deduplicated OPEN checklist
   *  items attributed to that day across THREE channels (so the timeline counter
   *  and the references section list the SAME set):
   *   1. LINKING — the item's text mentions the day;
   *   2. DAILY NOTE — the item lives in that day's daily note;
   *   3. CREATED TODAY — the item lives in a note created that day that does NOT
   *      link to another day (else it's attributed to that other day via Ch1).
   *  Each item counts once per day (identity `noteId#index`); checked (completed)
   *  items are skipped — only OPEN tasks are listed/counted. The timeline's
   *  per-day counter is `taskRefsByDate.get(iso)?.length`. Built by a single
   *  idle/debounced scan over `notes.items` (only notes whose cached preview has
   *  at least one OPEN checklist item), re-run on `notes.items` length change,
   *  `notes.previews` (autosave), and invalidate. */
  const taskRefsByDate = ref<Map<string, TaskMatch[]>>(new Map());

  /** ISO dates that have at least one note CREATED or MODIFIED that day (a cheap
   *  in-memory pass over `notes.items` — no content scan). Drives the timeline's
   *  orange "references" dot for dates with no daily note. Reactive over
   *  `notes.items`. */
  const createdModifiedByDate = computed<Set<string>>(() => {
    const set = new Set<string>();
    for (const n of notes.items) {
      const c = parseIsoDate(isoDate(new Date(n.dateCreated)));
      if (c) set.add(isoDate(c));
      // Skip modified === created (that's the created bucket, not a separate
      // edit); an actual edit on the same day still counts as a reference.
      if (n.dateEdited !== n.dateCreated) {
        const e = parseIsoDate(isoDate(new Date(n.dateEdited)));
        if (e) set.add(isoDate(e));
      }
    }
    return set;
  });

  // --- Task-reference aggregation scan --------------------------------------
  // Mirrors the scan the (now-removed) daily panel ran for the SELECTED date,
  // generalised to aggregate EVERY date token found into `taskRefsByDate` so the
  // timeline can show a per-date task indicator without a per-date re-scan. The
  // editor footer's References section consumes the same map. Gated on the
  // cached preview's checklist (only notes with checklist items are fetched),
  // run on `requestIdleCallback` + a debounce, token-guarded so a stale
  // (superseded) scan is discarded.
  let scanToken = 0;
  let scanDebounce: ReturnType<typeof setTimeout> | null = null;
  const requestIdle =
    typeof requestIdleCallback === "function"
      ? (cb: () => void) => requestIdleCallback(cb, { timeout: 800 })
      : (cb: () => void) => setTimeout(cb, 0);

  async function runTaskRefScan(token: number): Promise<void> {
    if (token !== scanToken) return;
    const settings = useSettingsStore();
    const dateFormat = settings.dateFormat;
    const taskInputs: NoteTaskInput[] = [];
    try {
      const db = getDatabase();
      for (const n of notes.items) {
        if (token !== scanToken) return;
        // Gate on the cached preview: only notes with at least one OPEN
        // checklist item can contribute (completed-only notes are skipped), and
        // only those are fetched. Notes without a preview yet are skipped —
        // they'll be picked up once their preview loads (a re-scan fires on
        // `notes.items` length change; previews load progressively).
        const preview = notes.previews[n.id];
        const cl = preview?.checklist;
        if (!cl || cl.total === 0 || cl.checked >= cl.total) continue;
        const item = await db.content.findByNoteId(n.id);
        if (!item || ("locked" in item && item.locked)) continue;
        const html = typeof item.data === "string" ? item.data : "";
        if (!html) continue;
        if (token !== scanToken) return;
        const doc = new DOMParser().parseFromString(html, "text/html");
        const lis = Array.from(doc.querySelectorAll(CHECKLIST_SELECTOR));
        if (!lis.length) continue;
        // `checked` mirrors the `<li>`'s `checked` class (rich `task-list` +
        // simple `check-list` both use it — see `utils/note-preview.ts`); the
        // helper skips checked items so only OPEN tasks are attributed.
        const items = lis.map((li) => ({
          text: (li.textContent ?? "").trim(),
          checked: li.classList.contains("checked")
        }));
        const parsedTitle = parseIsoDate(n.title);
        const dailyDay =
          dailyNoteIds.value.has(n.id) && parsedTitle ? isoDate(parsedTitle) : null;
        taskInputs.push({
          noteId: n.id,
          noteTitle: n.title || "Untitled",
          dailyDay,
          createdDay: isoDate(new Date(n.dateCreated)),
          items,
          contentText: (doc.body.textContent ?? "").trim()
        });
      }
    } catch (e) {
      logger.error("[daily-notes] task-ref scan failed:", e);
    } finally {
      if (token === scanToken) {
        taskRefsByDate.value = attributeTasks(taskInputs, dateFormat);
      }
    }
  }

  /** (Re)start the debounced task-reference scan. Each call supersedes any
   *  in-flight scan (bumped token) so a stale result is never written. */
  function refreshTaskRefs(): void {
    scanToken++;
    const token = scanToken;
    if (scanDebounce) clearTimeout(scanDebounce);
    scanDebounce = setTimeout(() => {
      scanDebounce = null;
      requestIdle(() => void runTaskRefScan(token));
    }, 250);
  }

  /** Find the reserved "daily" tag if it exists (read-only — does NOT create).
   *  Cached into {@link dailyTagId}. Returns `null` when the tag hasn't been
   *  created yet (no daily notes anywhere). */
  async function findDailyTag(): Promise<string | null> {
    const db = getDatabase();
    const existing = await db.tags.find(DAILY_TAG_TITLE);
    if (existing) {
      dailyTagId.value = existing.id;
      return existing.id;
    }
    dailyTagId.value = null;
    return null;
  }

  /** Get-or-create the reserved "daily" tag and return its id. Idempotent;
   *  `db.tags.add` throws on a duplicate title so find first, and re-find if a
   *  concurrent create wins the race. Only called when creating a daily note. */
  async function ensureDailyTag(): Promise<string> {
    const db = getDatabase();
    const existing = await db.tags.find(DAILY_TAG_TITLE);
    if (existing) {
      dailyTagId.value = existing.id;
      return existing.id;
    }
    try {
      const id = await db.tags.add({ title: DAILY_TAG_TITLE });
      dailyTagId.value = id;
      return id;
    } catch (e) {
      const again = await db.tags.find(DAILY_TAG_TITLE);
      if (again) {
        dailyTagId.value = again.id;
        return again.id;
      }
      logger.error("[daily-notes] ensureDailyTag failed:", e);
      throw e;
    }
  }

  /** Resolve the `tag → note` relation for the daily tag and rebuild the
   *  daily-note id set + title memo. Read-only and never throws — a failure
   *  leaves the previous sets intact. Safe to call repeatedly; a no-op when the
   *  daily tag doesn't exist yet (no daily notes). Also merges any daily-tagged
   *  note's ISO title into the memo so {@link findDailyNoteId} hits memory. */
  async function refreshDailyNotes(): Promise<void> {
    try {
      const tagId = await findDailyTag();
      if (!tagId) {
        dailyNoteIds.value = new Set();
        refreshed = true;
        return;
      }
      const db = getDatabase();
      const list = (await db.relations
        .from({ type: "tag", id: tagId }, "note")
        .resolve()) as Note[];
      const ids = new Set<string>();
      const relationIds = new Set<string>();
      // Rebuild the memo FROM SCRATCH (not spread from the previous one) so a
      // deleted or renamed daily note's stale `iso → id` entry is DROPPED —
      // otherwise the timeline dot would persist after a delete (the relation
      // set, trash-filtered below, is the source of truth).
      const memo: Record<string, string> = {};
      for (const n of list) {
        // `relations.from().resolve()` returns trashed notes too (a trashed
        // note keeps its tag relation); skip them so a deleted daily note's
        // timeline dot disappears (a `moveToTrash` reloads `notes.items` → this
        // re-resolves via the `notes.items.length` watch).
        if (n.deleted) continue;
        ids.add(n.id);
        relationIds.add(n.id);
        // Only treat a note as the daily note for `iso` when its title IS that
        // ISO date — a user could rename a daily note, in which case it stops
        // being findable by date (and will be re-created on next open).
        const parsed = parseIsoDate(n.title);
        if (parsed) memo[isoDate(parsed)] = n.id;
      }
      // Preserve optimistic memo entries (from ensureDailyNote/claimDraft) for
      // notes that are still alive in notes.items but whose tag relation hasn't
      // landed yet (a just-created daily note during the create→tag race).
      // Without this, a refresh firing mid-claim rebuilds the memo from the
      // relation set alone, the entry vanishes, and the delete-fallback watcher
      // falsely re-opens the draft (clearing the just-activated tab). Trashed
      // notes aren't in notes.items → dropped; renamed daily notes ARE in
      // relationIds → their old iso entry isn't preserved (correct).
      const liveIds = new Set(notes.items.map((n) => n.id));
      for (const [iso, id] of Object.entries(dailyNoteIdByDate.value)) {
        if (!memo[iso] && !relationIds.has(id) && liveIds.has(id)) {
          memo[iso] = id;
          ids.add(id);
        }
      }
      dailyNoteIds.value = ids;
      dailyNoteIdByDate.value = memo;
    } catch (e) {
      logger.error("[daily-notes] refreshDailyNotes failed:", e);
    } finally {
      refreshed = true;
    }
  }

  /** Find the existing daily-note id for `iso` (memo → refreshed relation set).
   *  Returns `null` when no daily note exists for that date. Does NOT create. */
  async function findDailyNoteId(iso: string): Promise<string | null> {
    const memoed = dailyNoteIdByDate.value[iso];
    if (memoed) return memoed;
    if (!refreshed) await refreshDailyNotes();
    return dailyNoteIdByDate.value[iso] ?? null;
  }

  /** Lookup-or-create the daily note for `iso`. Returns `{ id, title }` or
   *  `null` on failure. Memoized so repeated calls never recreate. The created
   *  note is NOT opened (`openNote: false`) — the caller opens it via
   *  {@link openDailyNote} / `layout.openNote`. Mirrors `createNoteForLink`. */
  async function ensureDailyNote(
    iso: string
  ): Promise<{ id: string; title: string } | null> {
    try {
      const existing = await findDailyNoteId(iso);
      if (existing) return { id: existing, title: iso };

      const id = await notes.create({ title: iso, openNote: false, content: "" });
      if (!id) return null;

      // Optimistically memoize BEFORE the async tag work so a concurrent
      // refreshDailyNotes (triggered by notes.create's load → the
      // notes.items.length watch) doesn't rebuild the memo from the relation set
      // alone (the tag relation hasn't landed yet) and drop this entry mid-create
      // — which would make the delete-fallback watcher falsely re-open the draft
      // and clear the just-activated tab. refreshDailyNotes preserves optimistic
      // entries whose note is still alive (see its merge step).
      dailyNoteIdByDate.value = { ...dailyNoteIdByDate.value, [iso]: id };
      dailyNoteIds.value = new Set([...dailyNoteIds.value, id]);

      const tagId = await ensureDailyTag();
      const db = getDatabase();
      await db.relations.add({ id: tagId, type: "tag" }, { id, type: "note" });

      return { id, title: iso };
    } catch (e) {
      logger.error("[daily-notes] ensureDailyNote failed:", e);
      return null;
    }
  }

  /** Select `iso` and show its daily note — WITHOUT creating one when it
   *  doesn't exist. If a daily note exists for `iso`, open it in the active
   *  editor group (and clear any pending draft). If none exists, set
   *  {@link pendingDailyDate} and clear the active group's active tab so the
   *  editor reveals a draft with the ISO title prefilled (the note is created
   *  only when the user types content — see {@link claimDraft}). The references
   *  panel (bound to the selected date) lists the day's references either way. */
  async function openDailyNote(iso: string): Promise<void> {
    selectedDate.value = iso;
    // Re-scan task references so the references section is fresh for this date on
    // view — a date just added to a checklist item elsewhere may not have been
    // picked up yet (the scan is debounced + idle, and opening a date doesn't
    // otherwise change notes.items/previews). Debounced inside refreshTaskRefs.
    refreshTaskRefs();
    const existing = await findDailyNoteId(iso);
    if (existing) {
      pendingDailyDate.value = null;
      layout.openNote(existing);
      return;
    }
    // No daily note yet: reveal a prefilled draft (no active tab in the active
    // group) instead of creating. The draft editor reads `pendingDailyDate` to
    // prefill the title; `claimDraft` tags it daily on first content.
    pendingDailyDate.value = iso;
    layout.clearActiveTab(layout.activeGroupId);
  }

  /** Explicitly CREATE the daily note for `iso` and open it — the right-click
   *  "Create daily note for {date}" path. Unlike {@link openDailyNote} this
   *  creates immediately (the user asked to). No-op (besides selecting) on
   *  failure. */
  async function createDailyNote(iso: string): Promise<void> {
    selectedDate.value = iso;
    pendingDailyDate.value = null;
    refreshTaskRefs();
    const r = await ensureDailyNote(iso);
    if (r) layout.openNote(r.id);
  }

  /** Sync daily-note id for `iso` from the memo (no await, no create). Returns
   *  `null` when no daily note exists for that date. Used by the timeline's
   *  right-click to decide whether a date row has a daily note to menu. */
  function dailyNoteIdFor(iso: string): string | null {
    return dailyNoteIdByDate.value[iso] ?? null;
  }

  /** Tag an already-created note as the daily note for `iso` + memoize it, then
   *  clear {@link pendingDailyDate}. Called by the editor when a daily draft
   *  (a prefilled-title draft for {@link pendingDailyDate}) is promoted to a
   *  real note on first content. Never throws — a failure leaves the note
   *  untagged (it'll still be the open note; the next `refreshDailyNotes` won't
   *  pick it up, so the date can be re-created). */
  async function claimDraft(noteId: string, iso: string): Promise<void> {
    // Optimistically memoize BEFORE the async tag work (see ensureDailyNote): a
    // concurrent refreshDailyNotes (from createDraft's load) must not wipe this
    // entry mid-claim and trigger the delete-fallback watcher to re-open the
    // draft (clearing the just-activated tab).
    dailyNoteIdByDate.value = { ...dailyNoteIdByDate.value, [iso]: noteId };
    dailyNoteIds.value = new Set([...dailyNoteIds.value, noteId]);
    try {
      const tagId = await ensureDailyTag();
      const db = getDatabase();
      await db.relations.add({ id: tagId, type: "tag" }, { id: noteId, type: "note" });
    } catch (e) {
      logger.error("[daily-notes] claimDraft failed:", e);
    } finally {
      pendingDailyDate.value = null;
    }
  }

  /** Set the selected date (the view's watcher calls {@link openDailyNote}). */
  function setSelectedDate(iso: string): void {
    selectedDate.value = iso;
  }

  /** Wipe all memo/sets — call on account/context switch so a stale daily-note
   *  id from the previous account is never reused. */
  function invalidate(): void {
    dailyNoteIdByDate.value = {};
    dailyNoteIds.value = new Set();
    dailyTagId.value = null;
    refreshed = false;
    pendingDailyDate.value = null;
    scanToken++;
    if (scanDebounce) {
      clearTimeout(scanDebounce);
      scanDebounce = null;
    }
    taskRefsByDate.value = new Map();
    selectedDate.value = todayIso();
  }

  // Refresh whenever the notes list grows/shrinks (a daily note created or
  // deleted here, or pulled by a sync). `items` is reassigned on `load()`; we
  // key on length so an in-place `dateEdited` patch (every save) does NOT
  // trigger a relation re-resolve. The same churn signals a task-reference
  // re-scan (a note's checklist content may have changed).
  watch(
    () => notes.items.length,
    () => {
      void refreshDailyNotes();
      refreshTaskRefs();
    }
  );

  // Re-scan task references when a note's content changes: `saveContent`
  // re-derives + reassigns `previews` on every autosave, so watching it picks up
  // a date added to a checklist item (the daily-note-bridge auto-links it, the
  // editor autosaves, the preview updates) without waiting for a create/delete.
  // Debounced + idle + token-guarded inside `refreshTaskRefs`, so rapid saves
  // coalesce and a stale scan is never written.
  watch(
    () => notes.previews,
    () => {
      refreshTaskRefs();
    }
  );

  return {
    selectedDate,
    pendingDailyDate,
    dailyNoteIds,
    dailyDates,
    createdModifiedByDate,
    taskRefsByDate,
    refreshDailyNotes,
    refreshTaskRefs,
    findDailyNoteId,
    dailyNoteIdFor,
    ensureDailyNote,
    openDailyNote,
    createDailyNote,
    claimDraft,
    setSelectedDate,
    invalidate
  };
});