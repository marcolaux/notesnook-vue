import { describe, it, expect } from "vitest";
import { parseMarkdownToHtml, formatBundledChangelog, formatChangelogRange, getLatestChangelogVersion } from "@/utils/markdown";

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

describe("getLatestChangelogVersion", () => {
  it("returns null for empty input", () => {
    expect(getLatestChangelogVersion("")).toBeNull();
  });

  it("extracts the topmost version string", () => {
    const raw = `# Changelog\n\n## [0.8.0] - 2026-07-27\n- Feature A\n\n## [0.7.1] - 2026-07-26\n- Fix B`;
    expect(getLatestChangelogVersion(raw)).toBe("0.8.0");
  });
});

describe("formatBundledChangelog", () => {
  it("returns empty string for empty input", () => {
    expect(formatBundledChangelog("")).toBe("");
  });

  it("extracts the topmost version section when no target version is supplied", () => {
    const rawContent = `# Changelog\n\nAll notable changes...\n\n## [0.8.0] - 2026-07-27\n\n### Feature\n- New feature\n\n## [0.7.1] - 2026-07-26\n\n### Fix\n- Bug fix`;
    const formatted = formatBundledChangelog(rawContent);
    expect(formatted).toContain("## [0.8.0]");
    expect(formatted).toContain("New feature");
    expect(formatted).not.toContain("## [0.7.1]");
    expect(formatted).not.toContain("# Changelog");
  });

  it("extracts specific section when target version is provided", () => {
    const rawContent = `# Changelog\n\n## [0.8.0] - 2026-07-27\n\n- Feature A\n\n## [0.7.1] - 2026-07-26\n\n- Fix B`;
    const formatted = formatBundledChangelog(rawContent, "0.7.1");
    expect(formatted).toContain("## [0.7.1]");
    expect(formatted).toContain("Fix B");
    expect(formatted).not.toContain("0.8.0");
  });
});

describe("formatChangelogRange", () => {
  const RAW = `# Changelog\n\n## [Unreleased]\n\n- pending\n\n## [0.8.0] - 2026-07-27\n\n- New 0.8.0\n\n## [0.7.1] - 2026-07-26\n\n- Fix 0.7.1\n\n## [0.7.0] - 2026-07-20\n\n- Old 0.7.0`;

  it("returns empty string for empty input", () => {
    expect(formatChangelogRange("")).toBe("");
  });

  it("returns empty string when no version sections are present", () => {
    expect(formatChangelogRange("# Changelog\n\n## [Unreleased]\n\n- pending")).toBe("");
  });

  it("returns all sections newest→fromVersion inclusive, excluding Unreleased and older entries", () => {
    const range = formatChangelogRange(RAW, "0.7.1");
    expect(range).toContain("## [0.8.0]");
    expect(range).toContain("New 0.8.0");
    expect(range).toContain("## [0.7.1]");
    expect(range).toContain("Fix 0.7.1");
    // Older than installed is excluded.
    expect(range).not.toContain("## [0.7.0]");
    expect(range).not.toContain("Old 0.7.0");
    // Unreleased header is always excluded.
    expect(range).not.toContain("## [Unreleased]");
    expect(range).not.toContain("pending");
    // Title header stripped.
    expect(range).not.toContain("# Changelog");
  });

  it("excludes the Unreleased section when installed is the newest", () => {
    const range = formatChangelogRange(RAW, "0.8.0");
    expect(range).toContain("## [0.8.0]");
    expect(range).not.toContain("## [Unreleased]");
    expect(range).not.toContain("## [0.7.1]");
  });

  it("returns all version sections when fromVersion is not found", () => {
    const range = formatChangelogRange(RAW, "0.5.0");
    expect(range).toContain("## [0.8.0]");
    expect(range).toContain("## [0.7.0]");
    expect(range).not.toContain("## [Unreleased]");
  });

  it("returns all version sections when no fromVersion is given", () => {
    const range = formatChangelogRange(RAW);
    expect(range).toContain("## [0.8.0]");
    expect(range).toContain("## [0.7.0]");
    expect(range).not.toContain("## [Unreleased]");
  });

  it("accepts a v-prefixed fromVersion", () => {
    const range = formatChangelogRange(RAW, "v0.7.1");
    expect(range).toContain("## [0.8.0]");
    expect(range).toContain("## [0.7.1]");
    expect(range).not.toContain("## [0.7.0]");
  });
});
