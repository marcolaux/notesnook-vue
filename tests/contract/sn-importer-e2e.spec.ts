// @vitest-environment node
/*
Fixture-driven tests: run the converter against the real Standard Notes export
samples in `import-data/example1` and `example2`, and unit-test the pure
importer helpers (`buildMediaIndex`, `sniffMime`, base64 round-trip).

These exercise the converter on real-world Lexical structures (example2 has
~1300 nodes, 95 tables, 459 images) — catching walker bugs the per-node unit
tests miss (deep nesting, mixed lists, multi-paragraph cells). Attachment
resolution is stubbed (no db/Electron): the stub returns a ref per fileUuid
with a mime chosen to exercise image vs video routing.
*/
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { lexicalToTipTapHtml } from "@notesnook-vue/editor-vue";
import type { Resolvers, AttachmentRef, TagRef } from "@notesnook-vue/editor-vue";
import {
  buildMediaIndex,
  sniffMime,
  bytesToBase64,
  base64ToUint8Array,
  mimeFromName,
  augmentMediaIndexFromMarkdown
} from "@/editor/sn-importer-utils";

const ROOT = resolve(__dirname, "../../import-data");
// The `import-data/` fixtures are gitignored (real Standard Notes exports,
// too large / private to ship). Skip the fixture-driven suites when they're
// absent (CI) so the pure-helper suites below still run. Note: `describe.skip`
// still runs the suite body at collection time, so `readFixtureEntries` guards
// the `readdirSync` and returns `[]` when the folder is missing — the suite's
// tests are then reported as skipped instead of crashing the file.
const FIXTURES_PRESENT = existsSync(ROOT);
const fixtureDescribe = FIXTURES_PRESENT ? describe : describe.skip;

/** Read a fixture folder's entries, or `[]` when the folder is absent. */
function readFixtureEntries(folder: string): { name: string; isDir: boolean }[] {
  const dir = resolve(ROOT, folder);
  return existsSync(dir)
    ? readdirSync(dir).map((name) => ({ name, isDir: false }))
    : [];
}

function readNote(folder: string, file: string): unknown {
  return JSON.parse(readFileSync(resolve(ROOT, folder, file), "utf-8"));
}

/** Stub resolvers that mime-route by the on-disk filename (via the real
 *  `buildMediaIndex`), so example2's `.png` → image. For example1's
 *  extensionless files we force video/mp4 (real sniffing is unit-tested
 *  separately) to exercise the `<video>` routing. */
function fixtureResolvers(folder: string, mediaIndex: Map<string, string>, snfileMime: string): Resolvers {
  return {
    async resolveAttachment(input): Promise<AttachmentRef | null> {
      if (input.kind === "snfile") {
        const name = mediaIndex.get(input.fileUuid.toLowerCase());
        const mime = snfileMime;
        return { hash: `H-${input.fileUuid.slice(0, 8)}`, filename: name ?? "f", mime, size: 100 };
      }
      return { hash: `H-${input.dataUrl.slice(0, 8)}`, filename: "inline", mime: input.mime ?? "image/png", size: 100 };
    },
    async resolveTag(title): Promise<TagRef | null> {
      return { id: `tag-${title}`, title };
    }
  };
}

fixtureDescribe("fixture: example2 (large export: ~1300 nodes, 95 tables, 459 images)", () => {
  const folder = "example2";
  const entries = readFixtureEntries(folder);
  const mediaIndex = buildMediaIndex(entries);

  it("buildMediaIndex indexes the image-<uuid>.png files", () => {
    expect(mediaIndex.size).toBeGreaterThan(400);
    // Every key is a uuid, every value starts with "image-".
    for (const [uuid, name] of mediaIndex) {
      expect(uuid).toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
      expect(name.startsWith("image-")).toBe(true);
    }
  });

  it("converts the note losslessly — every snfile → <img data-hash>", async () => {
    const note = readNote(folder, "note.json");
    const r = await lexicalToTipTapHtml(note, fixtureResolvers(folder, mediaIndex, "image/png"), "example2");
    expect(r.html.length).toBeGreaterThan(50_000);
    // Count snfile nodes in the source for an exact assertion.
    const src = JSON.stringify(note);
    const snfileCount = (src.match(/"type":"snfile"/g) || []).length;
    const imgCount = (r.html.match(/<img/g) || []).length;
    expect(imgCount).toBe(snfileCount);
    // Tables survive with multi-paragraph cells (the markdown loss).
    expect((r.html.match(/<table/g) || []).length).toBe(95);
    // Hashtags → tag chips.
    expect((r.html.match(/data-tag-id/g) || []).length).toBe(12);
    expect(r.tagIds.length).toBe(2);
    // No failures.
    expect(r.stats.failed).toEqual([]);
  });
});

fixtureDescribe("fixture: example1 (Obsidian-style academic notes)", () => {
  const folder = "example1";
  const entries = readFixtureEntries(folder);
  const mediaIndex = buildMediaIndex(entries);

  it("buildMediaIndex indexes the extensionless <uuid>. files", () => {
    expect(mediaIndex.size).toBe(5);
    for (const name of mediaIndex.values()) {
      // example1 files are bare uuids with a trailing dot (no `image-` prefix).
      expect(name.startsWith("image-")).toBe(false);
    }
  });

  it("converts the note — extensionless media routes to <video> (mime stub)", async () => {
    const note = readNote(folder, "note.json");
    const r = await lexicalToTipTapHtml(note, fixtureResolvers(folder, mediaIndex, "video/mp4"), "example1");
    // The stub returns video/mp4 for extensionless files → <video> nodes.
    const vidCount = (r.html.match(/<video/g) || []).length;
    const snfileCount = (JSON.stringify(note).match(/"type":"snfile"/g) || []).length;
    expect(vidCount).toBe(snfileCount);
    // unencrypted-image (remote URL) → <img src> (not ingested).
    expect((r.html.match(/<img/g) || []).length).toBeGreaterThan(0);
    expect(r.html).toContain("https://");
  });
});

describe("sniffMime — magic bytes", () => {
  it("png", () => {
    expect(sniffMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]))).toBe("image/png");
  });
  it("jpeg", () => {
    expect(sniffMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]))).toBe("image/jpeg");
  });
  it("mp4 video (isom brand)", () => {
    // ftyp box at offset 4; brand "isom" at offset 8.
    const b = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);
    expect(sniffMime(b)).toBe("video/mp4");
  });
  it("mp3 (frame sync)", () => {
    expect(sniffMime(new Uint8Array([0xff, 0xfb, 0x90, 0x00]))).toBe("audio/mpeg");
  });
  it("pdf", () => {
    expect(sniffMime(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]))).toBe("application/pdf");
  });
  it("unknown → octet-stream", () => {
    expect(sniffMime(new Uint8Array([0x01, 0x02, 0x03, 0x04]))).toBe("application/octet-stream");
  });
});

describe("base64 round-trip", () => {
  it("bytesToBase64 / base64ToUint8Array round-trips arbitrary bytes", () => {
    const original = new Uint8Array(Array.from({ length: 1000 }, (_, i) => i % 256));
    const b64 = bytesToBase64(original);
    const back = base64ToUint8Array(b64);
    expect(Array.from(back)).toEqual(Array.from(original));
  });

  it("mimeFromName maps common extensions", () => {
    expect(mimeFromName("image-abc.png")).toBe("image/png");
    expect(mimeFromName("song.mp3")).toBe("audio/mpeg");
    expect(mimeFromName("clip.webm")).toBe("video/webm");
    expect(mimeFromName("noext")).toBeNull();
  });
});

describe("buildMediaIndex — recursive relative paths", () => {
  it("indexes media in subfolders by uuid, mapping to the relative path", () => {
    const entries = [
      { name: "notes/note.json", isDir: false },
      { name: "media/image-aaaa1111-2222-3333-4444-555566667777.png", isDir: false },
      { name: "media/deep/cccc3333-4444-5555-6666-777788889999.jpg", isDir: false },
      { name: "readme.md", isDir: false },
      { name: "notes", isDir: true }
    ];
    const idx = buildMediaIndex(entries);
    expect(idx.size).toBe(2);
    expect(idx.get("aaaa1111-2222-3333-4444-555566667777")).toBe(
      "media/image-aaaa1111-2222-3333-4444-555566667777.png"
    );
    expect(idx.get("cccc3333-4444-5555-6666-777788889999")).toBe(
      "media/deep/cccc3333-4444-5555-6666-777788889999.jpg"
    );
  });

  it("first match wins when the same uuid appears in multiple folders", () => {
    const entries = [
      { name: "a/image-dddd4444-5555-6666-7777-888899990000.png", isDir: false },
      { name: "b/image-dddd4444-5555-6666-7777-888899990000.png", isDir: false }
    ];
    const idx = buildMediaIndex(entries);
    expect(idx.size).toBe(1);
    expect(idx.get("dddd4444-5555-6666-7777-888899990000")).toBe(
      "a/image-dddd4444-5555-6666-7777-888899990000.png"
    );
  });
});

describe("augmentMediaIndexFromMarkdown — legacy extensionless fallback", () => {
  // Mirrors example1: snfile.fileUuid ≠ on-disk filename; the markdown carries
  // the on-disk filenames in the same order as the JSON snfile nodes.
  const note = {
    root: {
      type: "root",
      children: [
        { type: "paragraph", children: [{ type: "snfile", fileUuid: "e715cbc9-2b53-4f96-a3f4-1af20c8cb8da" }] },
        { type: "paragraph", children: [{ type: "snfile", fileUuid: "20423789-8fee-45e0-8a3e-8383f68e0008" }] }
      ]
    }
  };
  const markdown = [
    "Some text",
    "[34d2c3c0-eb72-4c77-bd0f-9e9069918d4c.](./34d2c3c0-eb72-4c77-bd0f-9e9069918d4c.)",
    "![image](https://example.com/x.jpg)",
    "[95e1901f-42e5-4d43-909a-6d546e078e88.](./95e1901f-42e5-4d43-909a-6d546e078e88.)"
  ].join("\n");

  it("maps unmatched snfile uuids positionally to the markdown's local-file refs (prefixed by noteDir)", () => {
    const mediaIndex = new Map<string, string>(); // empty — nothing matches by uuid
    const res = augmentMediaIndexFromMarkdown(note, markdown, "example1", mediaIndex);
    expect(res.assigned).toBe(2);
    expect(res.stillMissing).toBe(0);
    expect(mediaIndex.get("e715cbc9-2b53-4f96-a3f4-1af20c8cb8da")).toBe(
      "example1/34d2c3c0-eb72-4c77-bd0f-9e9069918d4c."
    );
    expect(mediaIndex.get("20423789-8fee-45e0-8a3e-8383f68e0008")).toBe(
      "example1/95e1901f-42e5-4d43-909a-6d546e078e88."
    );
  });

  it("skips snfile uuids already resolved by direct match (common format)", () => {
    const mediaIndex = new Map<string, string>([
      ["e715cbc9-2b53-4f96-a3f4-1af20c8cb8da", "image-e715cbc9-...png"]
    ]);
    const res = augmentMediaIndexFromMarkdown(note, markdown, "example1", mediaIndex);
    // Only the second snfile needed a fallback; first was already present.
    expect(res.assigned).toBe(1);
    expect(mediaIndex.get("20423789-8fee-45e0-8a3e-8383f68e0008")).toBe(
      "example1/34d2c3c0-eb72-4c77-bd0f-9e9069918d4c."
    );
  });

  it("reports stillMissing when there are more snfiles than markdown refs", () => {
    const mediaIndex = new Map<string, string>();
    const res = augmentMediaIndexFromMarkdown(note, "[only-one](./only-one.)", "ex", mediaIndex);
    expect(res.assigned).toBe(1);
    expect(res.stillMissing).toBe(1);
  });

  it("handles a note at the root (noteDir empty)", () => {
    const mediaIndex = new Map<string, string>();
    augmentMediaIndexFromMarkdown(note, markdown, "", mediaIndex);
    expect(mediaIndex.get("e715cbc9-2b53-4f96-a3f4-1af20c8cb8da")).toBe(
      "34d2c3c0-eb72-4c77-bd0f-9e9069918d4c."
    );
  });
});