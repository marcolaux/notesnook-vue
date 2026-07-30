/**
 * Daily-notes pure helpers (no Pinia / no `db` deps) — shared by the daily-notes
 * store, the `DailyNotesPanel`, the `date-link` editor extension's matcher, and
 * the host bridge. Self-contained so it is unit-tested in isolation like
 * `utils/notes-list.ts` / `utils/note-preview.ts`.
 *
 * A daily note is identified by a reserved `"daily"` tag + an ISO-date title
 * (`YYYY-MM-DD`, local). These helpers handle:
 *  - ISO date <-> `Date` / day-range conversions (calendar-day, local boundary).
 *  - Building a detection regex that matches date tokens in EITHER ISO form OR
 *    the user's configured `dateFormat` (e.g. `DD-MM-YYYY`), with digit
 *    boundaries to avoid matching substrings of longer numbers.
 *  - Parsing a matched token back to a validated `{ iso, date }`, trying ISO
 *    first then the `dateFormat` layout.
 *
 * The detection regex and the format parser are kept separate: the regex has no
 * inner capture groups (so ISO and the format pattern can be combined into one
 * alternation without JS's no-duplicate-named-groups limitation), and the parser
 * uses a format-specific anchored regex with capture groups to slice the fields.
 *
 * Callers that know the user's configured `dateFormat` (the settings store's
 * `dateFormat` ref) pass it in so detection honours the user's locale; the
 * exported default is a fallback for host-less contexts (tests, isolated use).
 */

/** The reserved tag title that marks a note as a daily note. Case-sensitive
 *  (upstream `db.tags.find` uses `COLLATE BINARY`). Mirrors `TEMPLATE_TAG_TITLE`. */
export const DAILY_TAG_TITLE = "daily";

/** Fallback date format when the caller has no settings-store value. Mirrors
 *  the settings store's `DEFAULT_DATE_FORMAT` (`stores/settings.ts`) without
 *  importing it — keeps this util pure / testable (no Pinia + db graph). */
export const DEFAULT_DATE_FORMAT = "DD-MM-YYYY";

/** One calendar day in milliseconds. */
export const DAY_MS = 86_400_000;

/** Local midnight (start of the calendar day) as epoch ms. */
export function midnight(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Format a `Date` as a local ISO date string `YYYY-MM-DD`. */
export function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Today's ISO date string (local). */
export function todayIso(): string {
  return isoDate(new Date());
}

/** Parse a strict ISO `YYYY-MM-DD` string into a local `Date`, or `null` when
 *  the string is not a valid ISO date. */
export function parseIsoDate(s: string): Date | null {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(year, month - 1, day);
  // Guard against rollover (e.g. 2026-02-31 → March 3): the constructed date
  // must land in the same month the token claimed.
  if (d.getMonth() !== month - 1) return null;
  return d;
}

/** `n` calendar days after `d` (negative = before). Returns a new `Date`. */
export function addDays(d: Date, n: number): Date {
  const next = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  next.setDate(next.getDate() + n);
  return next;
}

/** The `[start, end)` epoch-ms range covering the local calendar day of `d`.
 *  `d` may be a `Date` or an ISO string. Returns `{ start, end }` where `end`
 *  is the start of the following day (exclusive). */
export function dayRange(d: Date | string): { start: number; end: number } {
  const date = typeof d === "string" ? (parseIsoDate(d) ?? new Date()) : d;
  const start = midnight(date);
  return { start, end: start + DAY_MS };
}

function escapeLiteral(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Tokenize a `dateFormat` into date-field tokens (`YYYY`/`YY`/`MM`/`DD`/…)
 *  interleaved with literal separators. Shared by the detection-regex and
 *  parser builders so they agree on the format's structure. */
const FORMAT_TOKEN = /(YYYY|YY|MM|DD|HH|mm|ss)|([^YMDHms]+)/g;

/**
 * Build a *detection* regex (global, digit-boundaried) that matches date tokens
 * in either ISO `YYYY-MM-DD` form or the user's `dateFormat`. The regex carries
 * no inner capture groups so the two alternatives can be combined freely; the
 * matched text is then parsed by {@link parseDateToken}. Digit lookbehind/
 * lookahead prevent matching a date-shaped run inside a longer number.
 */
export function buildDateRegex(dateFormat: string = DEFAULT_DATE_FORMAT): RegExp {
  const isoSource = "\\d{4}-\\d{1,2}-\\d{1,2}";
  const fmtSource = formatToRegexSource(dateFormat);
  const alts = [isoSource];
  if (fmtSource && fmtSource !== isoSource) alts.push(fmtSource);
  return new RegExp(`(?<!\\d)(?:${alts.join("|")})(?!\\d)`, "g");
}

/** Build a *strict* detection regex for LIVE auto-linking in the editor: 2-digit
 *  day/month (so a partial date being typed — `2026-07-2` — never matches
 *  prematurely) and ALPHANUMERIC boundaries (`(?<![\da-zA-Z])` / `(?![\da-zA-Z])`)
 *  so a date inside a word (`abc2026-07-29` / `2026-07-29abc`) is not linked.
 *  Used by `daily-note-bridge.ts`; the looser {@link buildDateRegex} (1-2 digit,
 *  digit boundaries) is used for scanning already-saved note content where
 *  tokens are complete. */
export function buildStrictDateRegex(dateFormat: string = DEFAULT_DATE_FORMAT): RegExp {
  const isoSource = "\\d{4}-\\d{2}-\\d{2}";
  const fmtSource = formatToStrictRegexSource(dateFormat);
  const alts = [isoSource];
  if (fmtSource && fmtSource !== isoSource) alts.push(fmtSource);
  return new RegExp(`(?<![\\da-zA-Z])(?:${alts.join("|")})(?![\\da-zA-Z])`, "g");
}

/** Strict variant of {@link formatToRegexSource}: 2-digit fields, no boundaries. */
function formatToStrictRegexSource(format: string): string {
  let out = "";
  let m: RegExpExecArray | null;
  FORMAT_TOKEN.lastIndex = 0;
  while ((m = FORMAT_TOKEN.exec(format))) {
    if (m[1]) {
      out += m[1] === "YYYY" ? "\\d{4}" : "\\d{2}";
    } else if (m[2]) {
      out += escapeLiteral(m[2]);
    }
  }
  return out;
}

/** Convert a `dateFormat` to a regex source (no capture groups, no boundaries). */
function formatToRegexSource(format: string): string {
  let out = "";
  let m: RegExpExecArray | null;
  FORMAT_TOKEN.lastIndex = 0;
  while ((m = FORMAT_TOKEN.exec(format))) {
    if (m[1]) {
      out += m[1] === "YYYY" ? "\\d{4}" : m[1] === "YY" ? "\\d{2}" : "\\d{1,2}";
    } else if (m[2]) {
      out += escapeLiteral(m[2]);
    }
  }
  return out;
}

export type DateField = "year" | "yy" | "month" | "day" | "hour" | "minute" | "second";

export interface DateParser {
  /** Anchored regex (`^…$`) with one capture group per date field, in `order`. */
  re: RegExp;
  /** The field each capture group represents, in order. */
  order: DateField[];
}

/** Build an anchored parser for the user's `dateFormat` (the inverse of
 *  {@link formatToRegexSource}, but with capture groups so the fields can be
 *  extracted). Used by {@link parseDateToken} after the ISO parse fails. */
export function buildDateParser(dateFormat: string = DEFAULT_DATE_FORMAT): DateParser {
  const order: DateField[] = [];
  let src = "";
  let m: RegExpExecArray | null;
  FORMAT_TOKEN.lastIndex = 0;
  while ((m = FORMAT_TOKEN.exec(dateFormat))) {
    if (m[1]) {
      const tok = m[1];
      if (tok === "YYYY") {
        src += "(\\d{4})";
        order.push("year");
      } else if (tok === "YY") {
        src += "(\\d{2})";
        order.push("yy");
      } else if (tok === "MM") {
        src += "(\\d{1,2})";
        order.push("month");
      } else if (tok === "DD") {
        src += "(\\d{1,2})";
        order.push("day");
      } else if (tok === "HH") {
        src += "(\\d{1,2})";
        order.push("hour");
      } else if (tok === "mm") {
        src += "(\\d{1,2})";
        order.push("minute");
      } else if (tok === "ss") {
        src += "(\\d{1,2})";
        order.push("second");
      }
    } else if (m[2]) {
      src += escapeLiteral(m[2]);
    }
  }
  return { re: new RegExp(`^${src}$`), order };
}

export interface ParsedDate {
  iso: string;
  date: Date;
}

/** Parse a date token (as matched by {@link buildDateRegex}) into a validated
 *  `{ iso, date }`. Tries ISO `YYYY-MM-DD` first, then the user's `dateFormat`.
 *  Returns `null` for an invalid date (e.g. month 13, day 32, or a rollover). */
export function parseDateToken(token: string, dateFormat: string = DEFAULT_DATE_FORMAT): ParsedDate | null {
  const iso = parseIsoDate(token);
  if (iso) return { iso: isoDate(iso), date: iso };
  const parser = buildDateParser(dateFormat);
  const m = parser.re.exec(token.trim());
  if (!m) return null;
  const f = { year: 0, month: 0, day: 0 };
  m.slice(1).forEach((g, idx) => {
    if (g === undefined) return;
    const field = parser.order[idx];
    if (field === "year") f.year = Number(g);
    else if (field === "yy") f.year = 2000 + Number(g);
    else if (field === "month") f.month = Number(g);
    else if (field === "day") f.day = Number(g);
  });
  if (!f.year || !f.month || !f.day) return null;
  if (f.month < 1 || f.month > 12 || f.day < 1 || f.day > 31) return null;
  const d = new Date(f.year, f.month - 1, f.day);
  if (d.getMonth() !== f.month - 1) return null; // rollover guard
  return { iso: isoDate(d), date: d };
}

export interface DateTokenMatch {
  /** The matched text. */
  token: string;
  /** The ISO date it normalizes to. */
  iso: string;
  /** Start/end offsets of `token` within the searched string. */
  start: number;
  end: number;
}

/** Find every date token in `text` (in ISO or `dateFormat` form) and normalize
 *  each to its ISO date. Invalid date-shaped runs (e.g. `2026-13-40`) are
 *  skipped. Used by the `DailyNotesPanel` to match task-item text to a day. */
export function findDateTokens(text: string, dateFormat: string = DEFAULT_DATE_FORMAT): DateTokenMatch[] {
  const re = buildDateRegex(dateFormat);
  const out: DateTokenMatch[] = [];
  let m: RegExpExecArray | null;
  re.lastIndex = 0;
  while ((m = re.exec(text))) {
    const token = m[0];
    const parsed = parseDateToken(token, dateFormat);
    if (!parsed) continue;
    out.push({ token, iso: parsed.iso, start: m.index, end: m.index + token.length });
  }
  return out;
}

/** True if `text` contains a date token that normalizes to `iso`. */
export function textMentionsDate(text: string, iso: string, dateFormat: string = DEFAULT_DATE_FORMAT): boolean {
  return findDateTokens(text, dateFormat).some((t) => t.iso === iso);
}

/** A single checklist item as parsed from a note's HTML. The index within
 *  `NoteTaskInput.items` (paired with `noteId`) is the item's stable identity
 *  for dedup. `checked` mirrors the `<li>`'s `checked` class so the attribution
 *  can be restricted to OPEN tasks. */
export interface NoteTaskItem {
  text: string;
  checked: boolean;
}

/** A note's checklist items + the metadata the task attribution needs. Built by
 *  the daily-notes store's scan (which does the DOM parse) and fed to
 *  {@link attributeTasks}, so the attribution logic stays pure / unit-testable
 *  (no `DOMParser` / `db` deps here). */
export interface NoteTaskInput {
  noteId: string;
  noteTitle: string;
  /** ISO day this note is the daily note for, or `null` when the note is not a
   *  daily note (its title isn't an ISO date or it isn't tagged daily). */
  dailyDay: string | null;
  /** ISO day the note was created (local) — precomputed by the store so this
   *  helper is timezone-independent. */
  createdDay: string;
  /** Checklist items in DOM order. */
  items: NoteTaskItem[];
  /** The note's full body text — scanned for date tokens to decide whether the
   *  note "links to another day" (channel-3 gate). */
  contentText: string;
}

/** A task attributed to a day — the shape both the timeline counter (via the
 *  per-day array's length) and the references panel (list rows) consume. */
export interface TaskAttribution {
  noteId: string;
  noteTitle: string;
  /** The item's index within its note's `items` (stable identity for dedup +
   *  Vue list keys). */
  itemIndex: number;
  itemText: string;
}

/** Attribute each OPEN checklist item to the day(s) it's relevant to and return
 *  a deduplicated per-day list. An item counts once per day it's attributed to
 *  (identity = `noteId#index`), so an item matching several channels for the
 *  same day appears once. Checked (completed) items are skipped — only OPEN
 *  tasks are listed/counted. Channels:
 *   1. LINKING — the item's text mentions a date `D` → attribute to `D`.
 *   2. DAILY NOTE — the containing note is the daily note for `dailyDay` →
 *      attribute every open item to `dailyDay`.
 *   3. CREATED TODAY — attribute every open item to `createdDay`, UNLESS the
 *      note mentions any date other than `createdDay` (a note "linking to
 *      another day" is attributed to that other day via channel 1 instead, so
 *      it's excluded here to avoid double attribution across days). */
export function attributeTasks(
  inputs: NoteTaskInput[],
  dateFormat: string = DEFAULT_DATE_FORMAT
): Map<string, TaskAttribution[]> {
  const byDay = new Map<string, { keys: Set<string>; items: TaskAttribution[] }>();
  for (const n of inputs) {
    // Any date mentioned anywhere in the note (prose + items). Channel 3 is
    // gated off when one of them is NOT the note's own created day.
    const noteMentioned = new Set(
      findDateTokens(n.contentText, dateFormat).map((t) => t.iso)
    );
    const linksToAnotherDay = [...noteMentioned].some((d) => d !== n.createdDay);
    n.items.forEach((item, idx) => {
      if (item.checked) return; // open tasks only
      const key = `${n.noteId}#${idx}`;
      const days = new Set<string>();
      // Channel 1 — item text mentions a date.
      for (const tok of findDateTokens(item.text, dateFormat)) days.add(tok.iso);
      // Channel 2 — item lives in the daily note for `dailyDay`.
      if (n.dailyDay) days.add(n.dailyDay);
      // Channel 3 — item lives in a note created on `createdDay` that doesn't
      // link to another day.
      if (!linksToAnotherDay) days.add(n.createdDay);
      for (const d of days) {
        let bucket = byDay.get(d);
        if (!bucket) {
          bucket = { keys: new Set(), items: [] };
          byDay.set(d, bucket);
        }
        if (!bucket.keys.has(key)) {
          bucket.keys.add(key);
          bucket.items.push({
            noteId: n.noteId,
            noteTitle: n.noteTitle,
            itemIndex: idx,
            itemText: item.text
          });
        }
      }
    });
  }
  const out = new Map<string, TaskAttribution[]>();
  for (const [d, b] of byDay) out.set(d, b.items);
  return out;
}