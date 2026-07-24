/**
 * Lightweight, safe Markdown-to-HTML parser for rendering release notes & changelogs.
 */
export function parseMarkdownToHtml(markdownText: string): string {
  if (!markdownText) return "";

  const lines = markdownText.split("\n");
  const htmlLines: string[] = [];
  let inList = false;

  for (let line of lines) {
    line = line.trimEnd();

    // Inline formatting: HTML escaping, inline code, bold, italic
    let formatted = line
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
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
      const text = formatted.replace(/^####\s+/, "");
      htmlLines.push(`<h4 class="mt-3 mb-1 text-xs font-bold text-text">${text}</h4>`);
      continue;
    }
    if (/^###\s+(.+)/.test(formatted)) {
      if (inList) { htmlLines.push("</ul>"); inList = false; }
      const text = formatted.replace(/^###\s+/, "");
      htmlLines.push(`<h3 class="mt-4 mb-1.5 text-sm font-bold text-text border-b border-border/40 pb-1">${text}</h3>`);
      continue;
    }
    if (/^##\s+(.+)/.test(formatted)) {
      if (inList) { htmlLines.push("</ul>"); inList = false; }
      const text = formatted.replace(/^##\s+/, "");
      htmlLines.push(`<h2 class="mt-4 mb-2 text-base font-bold text-text border-b border-border pb-1">${text}</h2>`);
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
