import { describe, it, expect } from "vitest";
import { chunkText, fnv1aHash, stripHtml } from "@notesnook-vue/shared";

describe("Vector Search Utilities", () => {
  it("fnv1aHash computes deterministic hex hashes", () => {
    const h1 = fnv1aHash("Hello Notesnook Vector Search");
    const h2 = fnv1aHash("Hello Notesnook Vector Search");
    const h3 = fnv1aHash("Different text content");

    expect(h1).toBe(h2);
    expect(h1).not.toBe(h3);
    expect(typeof h1).toBe("string");
    expect(h1.length).toBe(8);
  });

  it("stripHtml removes tags and decodes entities", () => {
    const raw = "<h1>Header</h1><p>This is &quot;formatted&quot; &amp; clean text.</p>";
    const stripped = stripHtml(raw);
    expect(stripped).toBe('Header This is "formatted" & clean text.');
  });

  it("chunkText splits text into overlapping word chunks", () => {
    const text = Array.from({ length: 500 }, (_, i) => `word${i}`).join(" ");
    const chunks = chunkText(text, 200, 20);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].index).toBe(0);
    expect(chunks[0].hash).toBeDefined();
    expect(chunks[0].text.split(/\s+/).length).toBeLessThanOrEqual(200);
  });

  it("recordUserActivity & isUserRecentlyActive track active user interactions", async () => {
    const { recordUserActivity, isUserRecentlyActive } = await import(
      "../../apps/desktop/src/renderer/src/utils/vector-search"
    );

    recordUserActivity();
    expect(isUserRecentlyActive(5000)).toBe(true);
    expect(isUserRecentlyActive(0)).toBe(false);
  });
});
