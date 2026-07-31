/**
 * Per-pane proactive suggestion controller (one instance per `Editor.vue`).
 *
 * Watches the editor's content (debounced after a typing pause), and — when the
 * note has enough text but NO notebook, NO tag, and NO color — runs the
 * similarity engine (`utils/note-similarity`) to surface suggested
 * notebook/tag/color chips derived from the most similar existing notes.
 *
 * Lifecycle / UX rules (confirmed with the user):
 *   • Trigger scope: ANY note being edited lacking all three assignments.
 *   • Search basis: semantic when enabled, else lexical FTS fallback.
 *   • Confidence-gated: weak signal → no overlay.
 *   • Dismissal: session-only; reappears only after ~`REAPPEAR_DELTA_WORDS` more
 *     words are added.
 *   • Assigning ANY one of notebook/tag/color closes the overlay (the
 *     all-three-absent gate flips), per spec.
 *
 * In-flight runs are guarded by a generation counter so a stale async result
 * (after a note switch or re-trigger) is dropped, never rendered.
 *
 * Bound to a SPECIFIC note via the per-pane `useNoteFooter` (tags/notebooks/color
 * refs), so a background split pane gets its own independent suggestions — not
 * the focused pane's.
 */
import { ref, computed, watch, onBeforeUnmount, type Ref } from "vue";
import { useNotesStore } from "@/stores/notes";
import { useCollectionsStore } from "@/stores/collections";
import {
  computeNoteSuggestions,
  keywordSuggestions,
  mergeCapped,
  CAP_NOTEBOOKS,
  CAP_TAGS,
  DEBOUNCE_MS,
  MIN_CONTENT_WORDS,
  RE_RUN_DELTA_WORDS,
  REAPPEAR_DELTA_WORDS,
  type NoteSuggestions
} from "@/utils/note-similarity";
import { logger } from "@/utils/logger";
import type { NoteFooter } from "./use-note-footer";

export interface UseNoteSuggestions {
  /** Whether the overlay should render (gate + non-empty result + not dismissed). */
  open: Ref<boolean>;
  /** The latest non-empty suggestion set, or `null` while hidden/loading. */
  suggestions: Ref<NoteSuggestions | null>;
  /** True while a run is in flight (the overlay stays hidden until it resolves). */
  loading: Ref<boolean>;
  /** Push current editor plaintext + title on each content change (debounced). */
  onContentChange: (text: string, title: string) => void;
  /** Hide the overlay for this note until ~`REAPPEAR_DELTA_WORDS` more words. */
  dismiss: () => void;
  /** One-click assignment actions (id-aware via the footer). */
  assignNotebook: (id: string) => Promise<void>;
  assignTag: (id: string) => Promise<void>;
  assignColor: (id: string) => Promise<void>;
}

/**
 * Session-only dismissal memory: noteId → word count at dismissal. The overlay
 * stays hidden for that note until the user adds ~`REAPPEAR_DELTA_WORDS` more
 * words (then the gate allows a fresh run). Cleared implicitly on app restart.
 */
const dismissedAt = new Map<string, number>();

export function useNoteSuggestions(
  noteId: Ref<string | null>,
  footer: NoteFooter
): UseNoteSuggestions {
  const notes = useNotesStore();
  const collections = useCollectionsStore();

  const suggestions = ref<NoteSuggestions | null>(null);
  const loading = ref(false);

  // Per-note bookkeeping (reset on note switch via the watch below).
  let lastRunWordCount = -1;
  let runId = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  /** The gate from the spec: a real note with content but no organization. */
  const gatePassed = computed(() => {
    const id = noteId.value;
    if (!id) return false;
    if (footer.notebooks.value.length > 0) return false;
    if (footer.tags.value.length > 0) return false;
    if (footer.color.value != null) return false;
    if (footer.wordCount.value < MIN_CONTENT_WORDS) return false;
    // Dismissal: reappear only after enough new content.
    const dismissed = dismissedAt.get(id);
    if (dismissed !== undefined && footer.wordCount.value < dismissed + REAPPEAR_DELTA_WORDS) {
      return false;
    }
    return true;
  });

  // `open` is deliberately NOT gated on `loading`: a re-run (triggered as the
  // user keeps typing) must NOT hide the existing suggestions while the embed/
  // search is in flight — that flicker reads as "suggestions vanish while
  // typing". The current set stays visible and is swapped in place when the
  // fresh result lands. The overlay only disappears on explicit dismiss, on an
  // assignment (the gate flips), or on a note switch.
  const open = computed(() =>
    gatePassed.value &&
    suggestions.value !== null &&
    (suggestions.value.notebooks.length > 0 ||
      suggestions.value.tags.length > 0 ||
      suggestions.value.colors.length > 0 ||
      suggestions.value.notes.length > 0)
  );

  /** Live (non-trashed/archived) note ids from the notes store, for filtering. */
  function liveNoteIds(): Set<string> {
    return new Set(notes.items.map((n) => n.id));
  }

  async function run(text: string, title: string, triggerWords: number): Promise<void> {
    const id = noteId.value;
    const myRun = ++runId;
    if (!id) return;
    const queryText = `${title}\n\n${text}`.trim();
    loading.value = true;
    logger.log("[note-suggestions] run start", {
      words: triggerWords,
      chars: queryText.length,
      backend: "auto"
    });
    try {
      const result = await computeNoteSuggestions(queryText, id, {
        limit: 24, // SIMILAR_K (kept inline to avoid exporting a constant the UI doesn't need)
        liveNoteIds: liveNoteIds(),
        titleFor: (nid) => notes.items.find((n) => n.id === nid)?.title
      });
      if (myRun !== runId) return; // stale (note switched / re-triggered)
      // Baseline is the word count AT TRIGGER time (the content this run
      // actually searched), not the live count by the time the async resolves
      // — otherwise words typed during the embed/search inflate the baseline
      // and the next re-run's delta is under-counted, so updates stop firing.
      lastRunWordCount = triggerWords;

      // Keyword signal: scan the note text for existing tag/notebook NAMES.
      // This is the direct "I typed AI → suggest the AI tag" path, independent
      // of the similarity search (which can't see tag names and, with an
      // English model, misreads German text). Bypasses the similarity
      // confidence gate — a literal name match is a strong signal on its own —
      // and is merged (union by id, keep higher score) into the similarity
      // notebooks/tags, so keyword matches rank at the top.
      const kw = keywordSuggestions(text, collections.tags, collections.notebooks);
      const merged: NoteSuggestions = {
        notebooks: mergeCapped(result.notebooks, kw.notebooks, CAP_NOTEBOOKS),
        tags: mergeCapped(result.tags, kw.tags, CAP_TAGS),
        colors: result.colors, // colors have no name to keyword-match
        notes: result.notes,
        matchedCount: result.matchedCount
      };

      // REFRESH (replace) the shown set with the fresh result so the chips
      // track the current content as the user keeps typing. An empty result
      // does NOT clear the overlay: the user is still typing and the existing
      // suggestions stay visible until explicitly dismissed (or an assignment
      // closes the gate). On the first run `suggestions` is null, so an empty
      // result leaves it null → nothing shown (spec: nothing found → nothing
      // shown). `hasAny` includes related notes + keyword matches: the overlay
      // shows even when no notebook/tag/color passed the similarity gate.
      const hasAny =
        merged.notebooks.length > 0 ||
        merged.tags.length > 0 ||
        merged.colors.length > 0 ||
        merged.notes.length > 0;
      logger.log("[note-suggestions] run done", {
        matched: merged.matchedCount,
        notebooks: merged.notebooks.length,
        tags: merged.tags.length,
        colors: merged.colors.length,
        notes: merged.notes.length,
        keywordTags: kw.tags.length,
        keywordNotebooks: kw.notebooks.length,
        applied: hasAny,
        stale: false
      });
      if (hasAny) suggestions.value = merged;
    } catch (e) {
      logger.error("[note-suggestions] run failed:", e);
      // Transient failure: keep the current suggestions rather than clearing
      // (don't punish ongoing typing for a one-off embed/search error).
    } finally {
      if (myRun === runId) loading.value = false;
    }
  }

  function onContentChange(text: string, title: string): void {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      const id = noteId.value;
      if (!id) return;
      // Re-run only when the gate holds AND content changed meaningfully since
      // the last run (or it's the first run for this note).
      const words = footer.wordCount.value;
      if (!gatePassed.value) {
        // Gate closed (e.g. user just assigned something): drop suggestions.
        suggestions.value = null;
        return;
      }
      const delta = lastRunWordCount >= 0 ? words - lastRunWordCount : Infinity;
      if (delta < RE_RUN_DELTA_WORDS) {
        logger.log("[note-suggestions] skip re-run (delta)", {
          words,
          lastRun: lastRunWordCount,
          delta,
          threshold: RE_RUN_DELTA_WORDS
        });
        return;
      }
      void run(text, title, words);
    }, DEBOUNCE_MS);
  }

  function dismiss(): void {
    const id = noteId.value;
    if (id) dismissedAt.set(id, footer.wordCount.value);
    suggestions.value = null;
  }

  async function assignNotebook(notebookId: string): Promise<void> {
    await footer.addNotebook(notebookId);
    suggestions.value = null; // gate closes on the footer reload; clear regardless
  }
  async function assignTag(tagId: string): Promise<void> {
    await footer.addTag(tagId);
    suggestions.value = null;
  }
  async function assignColor(colorId: string): Promise<void> {
    await footer.addColor(colorId);
    suggestions.value = null;
  }

  // Reset per-note state on note switch; cancel any in-flight run.
  watch(
    noteId,
    () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      runId++;
      suggestions.value = null;
      loading.value = false;
      lastRunWordCount = -1;
    },
    { immediate: true }
  );

  onBeforeUnmount(() => {
    if (timer) clearTimeout(timer);
    runId++;
  });

  return {
    open,
    suggestions,
    loading,
    onContentChange,
    dismiss,
    assignNotebook,
    assignTag,
    assignColor
  };
}