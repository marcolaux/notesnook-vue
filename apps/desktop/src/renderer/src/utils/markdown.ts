/**
 * Lightweight, safe Markdown & HTML parser for rendering release notes & changelogs.
 * Preserves valid HTML elements (so pre-formatted HTML notes render properly) while
 * parsing Markdown syntax (headings, lists, inline formatting, code, links).
 */
export function parseMarkdownToHtml(markdownText: string): string {
  if (!markdownText) return "";

  let text = markdownText.trim();

  // Convert Markdown links [text](url) -> <a href="url">text</a>
  text = text.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-accent underline hover:opacity-80 transition-opacity">$1</a>'
  );

  const lines = text.split("\n");
  const htmlLines: string[] = [];
  let inList = false;

  for (let rawLine of lines) {
    const line = rawLine.trimEnd();

    // Check if line is already an HTML block element (e.g. <h3>, <ul>, <li>, <p>, <div>, <hr>)
    const isHtmlBlockTag = /^\s*<\/?(h[1-6]|p|ul|ol|li|div|hr|blockquote|table|tr|td|th)\b/i.test(line);

    if (isHtmlBlockTag) {
      if (inList && !/^\s*<li\b/i.test(line)) {
        htmlLines.push("</ul>");
        inList = false;
      }
      htmlLines.push(line);
      continue;
    }

    // Escape standalone `<` or `>` that are NOT part of valid HTML tags (e.g., "a < b" -> "a &lt; b")
    let formatted = line.replace(/<(?![a-zA-Z/!])/g, "&lt;");

    // Inline Markdown formatting: code, bold, italic
    formatted = formatted
      .replace(/`([^`]+)`/g, '<code class="px-1.5 py-0.5 rounded bg-surface-muted border border-border font-mono text-[11px] text-accent">$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold text-text">$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em class="italic text-text-muted">$1</em>');

    // Horizontal rule
    if (/^(---|---|\*\*\*)$/.test(formatted.trim())) {
      if (inList) { htmlLines.push("</ul>"); inList = false; }
      htmlLines.push('<hr class="my-4 border-t border-border" />');
      continue;
    }

    // Headings
    if (/^####\s+(.+)/.test(formatted)) {
      if (inList) { htmlLines.push("</ul>"); inList = false; }
      const content = formatted.replace(/^####\s+/, "");
      htmlLines.push(`<h4 class="mt-3 mb-1 text-xs font-bold text-text">${content}</h4>`);
      continue;
    }
    if (/^###\s+(.+)/.test(formatted)) {
      if (inList) { htmlLines.push("</ul>"); inList = false; }
      const content = formatted.replace(/^###\s+/, "");
      htmlLines.push(`<h3 class="mt-4 mb-1.5 text-sm font-bold text-text border-b border-border/40 pb-1">${content}</h3>`);
      continue;
    }
    if (/^##\s+(.+)/.test(formatted)) {
      if (inList) { htmlLines.push("</ul>"); inList = false; }
      const content = formatted.replace(/^##\s+/, "");
      htmlLines.push(`<h2 class="mt-4 mb-2 text-base font-bold text-text border-b border-border pb-1">${content}</h2>`);
      continue;
    }
    if (/^#\s+(.+)/.test(formatted)) {
      if (inList) { htmlLines.push("</ul>"); inList = false; }
      const content = formatted.replace(/^#\s+/, "");
      htmlLines.push(`<h1 class="mt-4 mb-2 text-lg font-bold text-text border-b border-border pb-1">${content}</h1>`);
      continue;
    }

    // Unordered lists
    if (/^[-*]\s+(.+)/.test(formatted)) {
      if (!inList) { htmlLines.push('<ul class="my-1.5 pl-4 space-y-1 list-disc list-outside">'); inList = true; }
      const itemText = formatted.replace(/^[-*]\s+/, "");
      htmlLines.push(`<li class="text-xs text-text-muted leading-relaxed">${itemText}</li>`);
      continue;
    }

    // Close list if line is not a list item
    if (inList) {
      htmlLines.push("</ul>");
      inList = false;
    }

    // Empty lines
    if (!formatted.trim()) {
      htmlLines.push('<div class="h-1.5"></div>');
      continue;
    }

    // Paragraph
    htmlLines.push(`<p class="my-1 text-xs text-text-muted leading-relaxed">${formatted}</p>`);
  }

  if (inList) {
    htmlLines.push("</ul>");
  }

  return htmlLines.join("\n");
}

/**
 * Extract the latest (topmost) version tag from raw CHANGELOG.md content (e.g. "0.8.0").
 */
export function getLatestChangelogVersion(rawText: string): string | null {
  if (!rawText) return null;
  const match = rawText.match(/^##\s+\[?v?([0-9]+\.[0-9]+\.[0-9]+[^\s\]-]*)/m);
  return match ? (match[1] as string) : null;
}

/**
 * Format raw root CHANGELOG.md content for rendering in the Changelog modal.
 * Strips the top header and extracts the release section for `targetVersion`
 * (or the topmost newest version section if no target version is provided/matched).
 */
export function formatBundledChangelog(rawText: string, targetVersion?: string | null): string {
  if (!rawText) return "";

  const trimmed = rawText.trim();
  const firstHeaderIdx = trimmed.search(/^##\s+\[?/m);
  if (firstHeaderIdx === -1) return trimmed;

  const content = trimmed.slice(firstHeaderIdx).trim();

  if (targetVersion) {
    const cleanVer = targetVersion.replace(/^v/i, "").trim();
    const escaped = cleanVer.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`^##\\s+\\[?v?${escaped}\\]?`, "m");
    const match = content.match(regex);
    if (match && match.index !== undefined) {
      const startIdx = match.index;
      const rest = content.slice(startIdx);
      const nextHeaderMatch = rest.slice(match[0].length).search(/^##\s+\[?/m);
      if (nextHeaderMatch !== -1) {
        return rest.slice(0, match[0].length + nextHeaderMatch).trim();
      }
      return rest.trim();
    }
  }

  // Fallback: extract the topmost (newest) version section
  const nextHeaderIdx = content.slice(3).search(/^##\s+\[?/m);
  if (nextHeaderIdx !== -1) {
    return content.slice(0, 3 + nextHeaderIdx).trim();
  }
  return content;
}
