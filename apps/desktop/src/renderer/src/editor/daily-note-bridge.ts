/*
Daily-note bridge — the host side of live date → daily-note linking. Mirrors
`note-link-bridge.ts` but needs no editor-vue extension: the detection + insert
happen here (renderer-side, with direct access to `utils/daily-notes.ts` and the
daily-notes store).

Behaviour (the user's "every time I add/change a date it links to a daily note,
creating it if missing"):

  - AUTO-LINK: on every USER content transaction, scan the block at the cursor
    for a COMPLETE date token (strict 2-digit, alnum-boundaried — so a partial
    date being typed is never linked prematurely) that is NOT already inside a
    `link` mark. For each, `ensureDailyNote(iso)` (lookup-or-create) and wrap the
    token text in an `nn://note/<id>` `link` mark. Scanning only the cursor block
    bounds the cost and avoids aggressively linking every pre-existing date in a
    long note on the first keystroke.

  - REPOINT: in the same scan, a date token that IS already inside a `link` mark
    but whose href no longer points at that date's daily note (the user edited
    the date text, e.g. `2026-07-29` → `2026-07-30`) is repointed to the new
    date's daily note (created if missing).

The mark-applying transaction carries a `dateLinkApplied` meta so this listener
skips its own writes (no loop). It still fires `update` → autosave (the link is
persisted) and the note-link bridge's `onTransaction` (which adds the
`note`→`note` backlink relation for free).

Staleness: `ensureDailyNote` is async, so by the time it resolves the user may
have typed more. Each candidate re-checks `doc.textBetween(from,to)` against the
captured token before applying; a mismatch aborts that candidate.

Daily-note links are plain `nn://note/<id>` links, so the existing `openLink`
click handler (`note-link-bridge.ts`) opens them in a new tab unchanged.

Returns a disposer that removes the transaction listener + stops the dateFormat
watch.
*/
import { watch } from "vue";
import type { Editor } from "@tiptap/vue-3";
import type { Transaction } from "@tiptap/pm/state";
import {
  linkMarkAttrs,
  createInternalLink,
  noteIdFromLink
} from "@notesnook-vue/editor-vue";
import { useDailyNotesStore } from "@/stores/daily-notes";
import { useSettingsStore } from "@/stores/settings";
import { buildStrictDateRegex, parseDateToken } from "@/utils/daily-notes";
import { logger } from "@/utils/logger";

interface Candidate {
  from: number;
  to: number;
  token: string;
  iso: string;
  /** The note id the link currently points at (null = not yet linked). */
  currentId: string | null;
}

export function wireDailyLink(
  editor: Editor,
  getNoteId: () => string | null
): () => void {
  const daily = useDailyNotesStore();
  const settings = useSettingsStore();

  // Strict detection regex, rebuilt when the user's `dateFormat` changes.
  let regex = buildStrictDateRegex(settings.dateFormat);
  const stopFormatWatch = watch(
    () => settings.dateFormat,
    (fmt) => {
      regex = buildStrictDateRegex(fmt);
    }
  );

  /** Apply (or repoint) a `link` mark over [from,to] for `dailyNoteId`. */
  function applyLinkMark(from: number, to: number, dailyNoteId: string, iso: string): void {
    if (editor.isDestroyed) return;
    const linkType = editor.state.schema.marks.link;
    if (!linkType) return;
    const mark = linkType.create({
      ...linkMarkAttrs(createInternalLink("note", dailyNoteId)),
      title: iso
    });
    editor
      .chain()
      .command(({ tr }) => {
        tr.addMark(from, to, mark);
        tr.setMeta("dateLinkApplied", true);
        return true;
      })
      .run();
  }

  /** Collect date-token candidates (auto-link + repoint) in the cursor block. */
  function collectCandidates(): Candidate[] {
    const state = editor.state;
    const $pos = state.selection.$from;
    const depth = $pos.depth;
    if (depth < 1) return [];
    const blockStart = $pos.start(depth);
    const blockEnd = $pos.end(depth);
    const re = new RegExp(regex.source, regex.flags.includes("g") ? regex.flags : `${regex.flags}g`);
    const dateFormat = settings.dateFormat;
    const out: Candidate[] = [];
    state.doc.nodesBetween(blockStart, blockEnd, (node, pos) => {
      if (!node.isText || !node.text) return true;
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(node.text))) {
        const token = m[0];
        if (m.index === re.lastIndex) re.lastIndex++; // zero-length guard
        const parsed = parseDateToken(token, dateFormat);
        if (!parsed) continue;
        const linkMark = node.marks.find((mk) => mk.type.name === "link");
        const currentId = linkMark ? noteIdFromLink(linkMark.attrs.href as string) : null;
        out.push({
          from: pos + m.index,
          to: pos + m.index + token.length,
          token,
          iso: parsed.iso,
          currentId
        });
      }
      return true;
    });
    return out;
  }

  async function processCandidates(candidates: Candidate[]): Promise<void> {
    for (const c of candidates) {
      // Skip if the link already points at this date's daily note.
      const existing = await daily.findDailyNoteId(c.iso);
      if (c.currentId && existing && c.currentId === existing) continue;
      const r = await daily.ensureDailyNote(c.iso);
      if (!r) continue;
      // Staleness: the text at [from,to] must still be the captured token.
      if (editor.isDestroyed) return;
      const current = editor.state.doc.textBetween(c.from, c.to, "");
      if (current !== c.token) continue;
      applyLinkMark(c.from, c.to, r.id, c.iso);
    }
  }

  const onTransaction = ({ transaction: tr }: { transaction: Transaction }): void => {
    if (!tr.docChanged) return;
    if (tr.getMeta("preventUpdate") === true) return;
    if (tr.getMeta("dateLinkApplied") === true) return;
    const candidates = collectCandidates();
    if (candidates.length === 0) return;
    void processCandidates(candidates).catch((e) =>
      logger.error("[daily-note-bridge] link failed:", e)
    );
  };

  editor.on("transaction", onTransaction);

  // `getNoteId` is accepted for parity with `wireNoteLink` and future per-note
  // gating; linking currently runs in drafts too (relations seed on promote via
  // the note-link bridge's `syncNoteLinks`).
  void getNoteId;

  return () => {
    editor.off("transaction", onTransaction);
    stopFormatWatch();
  };
}