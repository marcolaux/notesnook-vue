/**
 * Contract tests for the proactive-suggestion engine
 * (`apps/desktop/src/renderer/src/utils/note-similarity.ts`).
 *
 * The engine's boundary deps (vector-search, the Electron `getDatabase`/
 * `getCurrentContext`, the semantic-search setting gate, and the logger) are
 * mocked so no Electron/Pinia/worker code loads. `note-similarity` is dynamic-
 * imported inside the tests (same pattern as `vector-search.spec.ts`) so the
 * mocked module registry is in effect before the engine pulls its imports.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocked boundary modules (hoisted) --------------------------------------
vi.mock("@/utils/vector-search", () => ({
  computeEmbedding: vi.fn(),
  searchVectorEmbeddingsByVector: vi.fn()
}));
vi.mock("@/platform/bootstrap", () => ({
  getDatabase: vi.fn(),
  getCurrentContext: vi.fn()
}));
vi.mock("@/stores/settings", () => ({
  readSemanticSearchEnabled: vi.fn()
}));
vi.mock("@/utils/logger", () => ({
  logger: { error: () => {}, log: () => {}, info: () => {}, warn: () => {} }
}));

// --- Helpers -----------------------------------------------------------------
type RelationsKind = "notebook" | "tag" | "color" | "note" | "attachment";

/** Build a fake `db` whose `db.relations.to(ref, kind).resolve()` dispatches by
 *  note id from the `assignments` table. */
function makeDb(assignments: Record<string, Partial<Record<RelationsKind, any[]>>> = {}) {
  return {
    notes: { all: [] as any[] },
    lookup: {
      notesWithHighlighting: vi.fn(async () => makeVg([]))
    },
    relations: {
      to: (ref: { id: string }, kind: RelationsKind) => ({
        resolve: () => Promise.resolve(assignments[ref.id]?.[kind] ?? [])
      })
    }
  };
}

/** Minimal `VirtualizedGrouping`-shaped object: `length` + `item(i) -> {item}`. */
function makeVg(items: { id: string }[]) {
  return {
    length: items.length,
    item: (i: number) => Promise.resolve({ item: items[i] ?? null })
  };
}

async function loadEngine() {
  return await import("../../apps/desktop/src/renderer/src/utils/note-similarity");
}

// --- Tests -------------------------------------------------------------------

describe("note-similarity · distinctiveTerms", () => {
  it("drops stopwords, short tokens, and pure numbers; ranks by frequency", async () => {
    const { distinctiveTerms } = await loadEngine();
    const terms = distinctiveTerms(
      "The quick brown fox jumps over the lazy dog. The fox is 123 quick today."
    );
    expect(terms).toContain("quick");
    expect(terms).toContain("fox");
    expect(terms).not.toContain("the");
    expect(terms).not.toContain("is");
    expect(terms).not.toContain("over");
    expect(terms).not.toContain("123"); // pure number
    expect(terms).toContain("today"); // 'today' is not a stopword → kept
    // frequency winners first
    expect(terms.indexOf("quick")).toBeLessThan(terms.indexOf("brown"));
  });

  it("returns [] for empty / stopword-only input", async () => {
    const { distinctiveTerms } = await loadEngine();
    expect(distinctiveTerms("")).toEqual([]);
    expect(distinctiveTerms("the and of to in on or is")).toEqual([]);
    expect(distinctiveTerms("123 456 78")).toEqual([]);
  });

  it("caps at the lexical term limit", async () => {
    const { distinctiveTerms } = await loadEngine();
    const text = Array.from({ length: 40 }, (_, i) => `distinctword${i}`).join(" ");
    expect(distinctiveTerms(text).length).toBe(15);
  });
});

describe("note-similarity · keywordSuggestions", () => {
  it("matches tags on any /-segment (AI → AI/Hermes + AI/Claude; NAS → NAS)", async () => {
    const { keywordSuggestions } = await loadEngine();
    const tags = [
      { id: "t1", title: "AI/Hermes" },
      { id: "t2", title: "AI/Claude" },
      { id: "t3", title: "selfhost" },
      { id: "t4", title: "NAS" }
    ];
    const out = keywordSuggestions("ich schreibe AI in diesem Text", tags, []);
    expect(out.tags.map((t) => t.id).sort()).toEqual(["t1", "t2"]);
    expect(out.notebooks).toEqual([]);
  });

  it("matches a leaf segment (Hermes → AI/Hermes)", async () => {
    const { keywordSuggestions } = await loadEngine();
    const out = keywordSuggestions("etwas über Hermes hier", [
      { id: "t1", title: "AI/Hermes" },
      { id: "t2", title: "AI/Claude" }
    ], []);
    expect(out.tags.map((t) => t.id)).toEqual(["t1"]);
  });

  it("keeps short 2-char tokens that distinctiveTerms would drop (AI, NAS)", async () => {
    const { keywordSuggestions, distinctiveTerms } = await loadEngine();
    // distinctiveTerms drops <3-char tokens; keywordSuggestions must keep them.
    expect(distinctiveTerms("AI NAS foo")).not.toContain("ai");
    const out = keywordSuggestions("AI NAS", [{ id: "nas", title: "NAS" }], []);
    expect(out.tags.map((t) => t.id)).toEqual(["nas"]);
  });

  it("matches notebooks on the FULL title phrase (no false 'my' match)", async () => {
    const { keywordSuggestions } = await loadEngine();
    const nbs = [
      { id: "nb1", title: "My Notebook" },
      { id: "nb2", title: "Inbox" }
    ];
    // "my notes here" must NOT match "My Notebook"; "Inbox" matches "Inbox".
    const out = keywordSuggestions("these are my notes here, not Inbox", [], nbs);
    expect(out.notebooks.map((n) => n.id)).toEqual(["nb2"]);
    const out2 = keywordSuggestions("open my notebook please", [], nbs);
    expect(out2.notebooks.map((n) => n.id)).toEqual(["nb1"]);
  });

  it("handles German umlauts / Unicode tokenization", async () => {
    const { keywordSuggestions } = await loadEngine();
    const out = keywordSuggestions("die Größe der Datei ist groß", [
      { id: "g", title: "Größe" }
    ], []);
    expect(out.tags.map((t) => t.id)).toEqual(["g"]);
  });

  it("returns empty for empty text / no matches", async () => {
    const { keywordSuggestions } = await loadEngine();
    expect(keywordSuggestions("", [{ id: "x", title: "AI" }], [{ id: "nb", title: "Inbox" }])).toEqual({
      tags: [],
      notebooks: []
    });
    expect(keywordSuggestions("nichts passendes hier", [{ id: "x", title: "AI" }], [])).toEqual({
      tags: [],
      notebooks: []
    });
  });

  it("mergeCapped unions by id keeping the higher score and re-caps", async () => {
    const { mergeCapped } = await loadEngine();
    const a = [
      { id: "1", title: "x", score: 0.5 },
      { id: "2", title: "y", score: 0.9 }
    ];
    const b = [
      { id: "2", title: "y", score: 1.2 }, // higher → wins
      { id: "3", title: "z", score: 0.1 }
    ];
    const merged = mergeCapped(a, b, 5);
    expect(merged.map((m) => m.id).sort()).toEqual(["1", "2", "3"]);
    expect(merged.find((m) => m.id === "2")!.score).toBeCloseTo(1.2, 5);
    // cap respected
    expect(mergeCapped(a, b, 2).length).toBe(2);
  });

  it("alias does not fire for unrelated text (no false positives)", async () => {
    const { keywordSuggestions } = await loadEngine();
    const out = keywordSuggestions("nichts relevantes hier", [
      { id: "t1", title: "AI/Hermes" },
      { id: "s", title: "Speicher" }
    ], []);
    expect(out.tags).toEqual([]);
  });

  it("cross-language: German KI does NOT match an English AI tag (no glossary)", async () => {
    const { keywordSuggestions } = await loadEngine();
    // The bilingual glossary was removed; the keyword path is literal-only.
    // Cross-language matching is the semantic path's job.
    const out = keywordSuggestions("KI ist eine interessante Sache", [
      { id: "t1", title: "AI/Hermes" }
    ], []);
    expect(out.tags).toEqual([]);
  });
});

describe("note-similarity · findSimilarNotes", () => {
  beforeEach(async () => {
    const settings = await import("@/stores/settings");
    const vector = await import("@/utils/vector-search");
    const bootstrap = await import("@/platform/bootstrap");
    vi.mocked(settings.readSemanticSearchEnabled).mockReturnValue(true);
    vi.mocked(bootstrap.getCurrentContext).mockReturnValue({} as any);
    vi.mocked(vector.computeEmbedding).mockResolvedValue(new Float32Array(4));
  });

  it("excludes the current note and filters to liveNoteIds (semantic path)", async () => {
    const vector = await import("@/utils/vector-search");
    vi.mocked(vector.searchVectorEmbeddingsByVector).mockResolvedValue([
      { noteId: "current", chunkIndex: 0, distance: 0.1 },
      { noteId: "a", chunkIndex: 0, distance: 0.2 },
      { noteId: "b", chunkIndex: 0, distance: 0.5 },
      { noteId: "trashed", chunkIndex: 0, distance: 0.3 }
    ]);

    const { findSimilarNotes } = await loadEngine();
    const result = await findSimilarNotes("some text", "current", {
      limit: 10,
      liveNoteIds: new Set(["a", "b"])
    });

    const ids = result.map((r) => r.noteId);
    expect(ids).not.toContain("current"); // self excluded
    expect(ids).not.toContain("trashed"); // not in liveNoteIds
    expect(ids).toEqual(["a", "b"]);
    // cosine weight = 1 - distance, sorted desc
    expect(result[0].noteId).toBe("a");
    expect(result[0].weight).toBeCloseTo(0.8, 5);
    expect(result[1].weight).toBeCloseTo(0.5, 5);
  });

  it("falls back to lexical OR query when semantic is disabled", async () => {
    const settings = await import("@/stores/settings");
    const bootstrap = await import("@/platform/bootstrap");
    vi.mocked(settings.readSemanticSearchEnabled).mockReturnValue(false);

    const db = makeDb();
    db.lookup.notesWithHighlighting = vi.fn(async (_q: string, _notes: any, _opts: any) =>
      makeVg([{ id: "n1" }, { id: "n2" }, { id: "n3" }])
    );
    vi.mocked(bootstrap.getDatabase).mockReturnValue(db as any);

    const { findSimilarNotes } = await loadEngine();
    const result = await findSimilarNotes("alpha beta gamma delta epsilon", "current", {
      limit: 5,
      liveNoteIds: new Set(["n1", "n2", "n3"])
    });

    expect(db.lookup.notesWithHighlighting).toHaveBeenCalledOnce();
    const query = db.lookup.notesWithHighlighting.mock.calls[0][0] as string;
    expect(query).toMatch(/ OR /); // OR-joined distinctive terms
    expect(result.map((r) => r.noteId)).toEqual(["n1", "n2", "n3"]);
    // decayed-rank weight: 1/(rank+1)
    expect(result[0].weight).toBeCloseTo(1, 5);
    expect(result[1].weight).toBeCloseTo(0.5, 5);
    expect(result[2].weight).toBeCloseTo(1 / 3, 5);
  });
});

describe("note-similarity · aggregateSuggestions (confidence gate)", () => {
  it("surfaces candidates within SUPPORT_RATIO_OF_TOP of the strongest, drops the long tail", async () => {
    const bootstrap = await import("@/platform/bootstrap");
    // top tag "strong" in 3 notes (support 3); "mid" in 2 notes (support 2,
    // ≥ 0.5×3 = 1.5 → kept); "weak" in 2 notes (support 0.6, < 1.5 → dropped).
    const assignments: Record<string, Partial<Record<RelationsKind, any[]>>> = {
      a: { tag: [{ id: "strong", title: "Strong" }, { id: "mid", title: "Mid" }] },
      b: { tag: [{ id: "strong", title: "Strong" }, { id: "mid", title: "Mid" }] },
      c: { tag: [{ id: "strong", title: "Strong" }] },
      d: { tag: [{ id: "weak", title: "Weak" }] },
      e: { tag: [{ id: "weak", title: "Weak" }] }
    };
    vi.mocked(bootstrap.getDatabase).mockReturnValue(makeDb(assignments) as any);
    const { aggregateSuggestions } = await loadEngine();
    const out = await aggregateSuggestions([
      { noteId: "a", weight: 1 },
      { noteId: "b", weight: 1 },
      { noteId: "c", weight: 1 },
      { noteId: "d", weight: 0.3 },
      { noteId: "e", weight: 0.3 }
    ]);
    const ids = out.tags.map((t) => t.id);
    expect(ids).toContain("strong");
    expect(ids).toContain("mid");
    expect(ids).not.toContain("weak"); // below 0.5× top support
  });

  it("surfaces a notebook that appears in enough similar notes and drops weak ones", async () => {
    const bootstrap = await import("@/platform/bootstrap");
    // 5 similar notes, weights 1..0.5. total weight = 3.0.
    // nb1 in 3 notes (weights 1, 0.667, 0.5 → support 2.167, count 3) → passes.
    // nb2 in 1 note (count 1) → fails MIN_SUPPORT_COUNT=2.
    const assignments: Record<string, Partial<Record<RelationsKind, any[]>>> = {
      a: { notebook: [{ id: "nb1", title: "Projects" }] },
      b: { notebook: [{ id: "nb1", title: "Projects" }] },
      c: { notebook: [{ id: "nb1", title: "Projects" }] },
      d: { notebook: [{ id: "nb2", title: "Weak" }] }
    };
    vi.mocked(bootstrap.getDatabase).mockReturnValue(makeDb(assignments) as any);

    const { aggregateSuggestions } = await loadEngine();
    const similar = [
      { noteId: "a", weight: 1.0 },
      { noteId: "b", weight: 0.667 },
      { noteId: "c", weight: 0.5 },
      { noteId: "d", weight: 0.4 },
      { noteId: "e", weight: 0.4 } // no notebook
    ];
    const out = await aggregateSuggestions(similar);
    expect(out.notebooks.map((n) => n.id)).toEqual(["nb1"]);
    expect(out.notebooks[0].title).toBe("Projects");
  });

  it("returns empty result when no candidate passes the gate", async () => {
    const bootstrap = await import("@/platform/bootstrap");
    const assignments: Record<string, Partial<Record<RelationsKind, any[]>>> = {
      a: { tag: [{ id: "t1", title: "lonely" }] }, // count 1 → fails
      b: { tag: [{ id: "t2", title: "also-lonely" }] }
    };
    vi.mocked(bootstrap.getDatabase).mockReturnValue(makeDb(assignments) as any);
    const { aggregateSuggestions } = await loadEngine();
    const out = await aggregateSuggestions([
      { noteId: "a", weight: 1 },
      { noteId: "b", weight: 1 }
    ]);
    expect(out.tags).toEqual([]);
    expect(out.notebooks).toEqual([]);
    expect(out.colors).toEqual([]);
  });

  it("returns empty (matchedCount 0) for no similar notes", async () => {
    const { aggregateSuggestions } = await loadEngine();
    const out = await aggregateSuggestions([]);
    expect(out.matchedCount).toBe(0);
    expect(out.notebooks).toEqual([]);
  });

  it("aggregates tags and colors across similar notes", async () => {
    const bootstrap = await import("@/platform/bootstrap");
    const assignments: Record<string, Partial<Record<RelationsKind, any[]>>> = {
      a: { tag: [{ id: "t1", title: "rust" }], color: [{ id: "c1", title: "Red", colorCode: "#f00" }] },
      b: { tag: [{ id: "t1", title: "rust" }], color: [{ id: "c1", title: "Red", colorCode: "#f00" }] },
      c: { tag: [{ id: "t1", title: "rust" }] }
    };
    vi.mocked(bootstrap.getDatabase).mockReturnValue(makeDb(assignments) as any);
    const { aggregateSuggestions } = await loadEngine();
    const out = await aggregateSuggestions([
      { noteId: "a", weight: 1 },
      { noteId: "b", weight: 1 },
      { noteId: "c", weight: 1 }
    ]);
    expect(out.tags.map((t) => t.id)).toEqual(["t1"]);
    expect(out.colors.map((c) => c.id)).toEqual(["c1"]);
    expect(out.colors[0].colorCode).toBe("#f00");
  });

  it("surfaces the top similar notes (by weight) with titles via titleFor, ungated", async () => {
    const bootstrap = await import("@/platform/bootstrap");
    // No assignments at all on any similar note → no notebook/tag/color, but
    // the similar notes themselves still surface for Open / Link.
    vi.mocked(bootstrap.getDatabase).mockReturnValue(makeDb({}) as any);
    const { aggregateSuggestions } = await loadEngine();
    const titles: Record<string, string> = { a: "Alpha", b: "Beta", c: "Gamma" };
    const out = await aggregateSuggestions(
      [
        { noteId: "a", weight: 0.9 },
        { noteId: "b", weight: 0.6 },
        { noteId: "c", weight: 0.3 }
      ],
      (id) => titles[id]
    );
    expect(out.notebooks).toEqual([]);
    expect(out.tags).toEqual([]);
    expect(out.colors).toEqual([]);
    expect(out.notes.map((n) => n.id)).toEqual(["a", "b", "c"]); // by weight desc
    expect(out.notes[0].title).toBe("Alpha");
    expect(out.notes[0].score).toBeCloseTo(0.9, 5);
  });

  it("falls back to the note id when titleFor is not provided", async () => {
    const bootstrap = await import("@/platform/bootstrap");
    vi.mocked(bootstrap.getDatabase).mockReturnValue(makeDb({}) as any);
    const { aggregateSuggestions } = await loadEngine();
    const out = await aggregateSuggestions([{ noteId: "xyz", weight: 1 }]);
    expect(out.notes[0].title).toBe("xyz");
  });
});