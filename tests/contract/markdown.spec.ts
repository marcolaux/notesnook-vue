import { describe, it, expect } from "vitest";
import { parseMarkdownToHtml, formatBundledChangelog } from "@/utils/markdown";

describe("parseMarkdownToHtml", () => {
  it("returns empty string for empty input", () => {
    expect(parseMarkdownToHtml("")).toBe("");
  });

  it("converts Markdown headings", () => {
    const html = parseMarkdownToHtml("### Heading 3\n#### Heading 4");
    expect(html).toContain('<h3 class="mt-4 mb-1.5 text-sm font-bold text-text border-b border-border/40 pb-1">Heading 3</h3>');
    expect(html).toContain('<h4 class="mt-3 mb-1 text-xs font-bold text-text">Heading 4</h4>');
  });

  it("converts Markdown unordered lists", () => {
    const html = parseMarkdownToHtml("- Item 1\n- Item 2");
    expect(html).toContain('<ul class="my-1.5 pl-4 space-y-1 list-disc list-outside">');
    expect(html).toContain('<li class="text-xs text-text-muted leading-relaxed">Item 1</li>');
    expect(html).toContain('<li class="text-xs text-text-muted leading-relaxed">Item 2</li>');
    expect(html).toContain("</ul>");
  });

  it("preserves pre-formatted HTML elements without escaping them to &lt; tag &gt;", () => {
    const rawHtml = "<h3>Title</h3>\n<p>Some text with <strong>bold</strong></p>\n<ul>\n<li>List item</li>\n</ul>";
    const html = parseMarkdownToHtml(rawHtml);
    expect(html).toContain("<h3>Title</h3>");
    expect(html).toContain("<p>Some text with <strong>bold</strong></p>");
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>List item</li>");
    expect(html).not.toContain("&lt;h3&gt;");
    expect(html).not.toContain("&lt;p&gt;");
  });

  it("escapes standalone '<' while leaving valid HTML tags unescaped", () => {
    const input = "Check if 5 < 10\n- Option <strong>A</strong>";
    const html = parseMarkdownToHtml(input);
    expect(html).toContain("5 &lt; 10");
    expect(html).toContain("<strong>A</strong>");
    expect(html).not.toContain("&lt;strong&gt;");
  });

  it("converts Markdown links [text](url)", () => {
    const html = parseMarkdownToHtml("Visit [Notesnook](https://notesnook.com)");
    expect(html).toContain('<a href="https://notesnook.com" target="_blank" rel="noopener noreferrer" class="text-accent underline hover:opacity-80 transition-opacity">Notesnook</a>');
  });
});

describe("formatBundledChangelog", () => {
  it("returns empty string for empty input", () => {
    expect(formatBundledChangelog("")).toBe("");
  });

  it("strips root # Changelog header and starts at the first ## [version] section", () => {
    const rawContent = `# Changelog\n\nAll notable changes...\n\n## [0.4.3] - 2026-07-24\n\n### Feature\n- Notes`;
    const formatted = formatBundledChangelog(rawContent);
    expect(formatted).toBe("## [0.4.3] - 2026-07-24\n\n### Feature\n- Notes");
    expect(formatted).not.toContain("# Changelog");
  });
});
