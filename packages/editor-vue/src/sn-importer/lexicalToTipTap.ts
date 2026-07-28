/*
Standard Notes (Lexical) → Notesnook (TipTap HTML) converter.

A pure, async tree-walk: given a Lexical editor-state JSON value (SN's
`note.text` = `editor.getEditorState().toJSON()`) and a pair of injected
resolvers, it emits the TipTap HTML string Notesnook persists
(`db.notes.add({ content: { type: "tiptap", data: html } })`). Every editor
extension round-trips via its `parseHTML` rules, so the emitted HTML re-parses
to the same document the editor would have produced.

Why HTML (not ProseMirror JSON): HTML is the canonical persistence form, and
building a ProseMirror JSON doc would require a schema instance (the whole
editor). HTML keeps this module schema-agnostic and unit-testable with zero
editor/db deps — only the injected `Resolvers` touch the outside world.

The Lexical node set is the Standard Notes super-editor's full set (confirmed
by exhaustive grep of the SN source — no math/diagram/callout/nested-table/
footnote nodes exist). Mappings and their (unavoidable) losses are documented
inline; see the plan for the full fidelity table.
*/
import type {
  LexicalEditorState,
  LexicalNode,
  Resolvers,
  ConvertResult,
  ConvertStats,
  AttachmentInput,
  AttachmentRef,
  TagRef
} from "./types";

// ---------------------------------------------------------------------------
// Lexical TextNode `format` bitmask (standard Lexical constants). The SN data
// confirms 1/2/4/8/128 (bold/italic/strike/underline/highlight); 16/32/64 are
// the standard code/subscript/superscript bits and are handled for completeness
// even though the sample notes don't exercise them.
// ---------------------------------------------------------------------------
const BOLD = 1;
const ITALIC = 2;
const STRIKE = 4;
const UNDERLINE = 8;
const CODE = 16;
const SUBSCRIPT = 32;
const SUPERSCRIPT = 64;
const HIGHLIGHT = 128;

// Mark open order (outer→inner). Close in reverse. Fixed so nesting is stable
// and round-trips identically.
const MARK_ORDER: Array<{ bit: number; tag: string }> = [
  { bit: BOLD, tag: "strong" },
  { bit: ITALIC, tag: "em" },
  { bit: UNDERLINE, tag: "u" },
  { bit: STRIKE, tag: "s" },
  { bit: SUBSCRIPT, tag: "sub" },
  { bit: SUPERSCRIPT, tag: "sup" },
  { bit: CODE, tag: "code" },
  { bit: HIGHLIGHT, tag: "mark" }
];

// Lexical TableCellHeaderStates.
const HEADER_NO_STATUS = 0;
const HEADER_ROW = 2; // row header

// ---------------------------------------------------------------------------
// Escaping — centralised and the single biggest pitfall. Every text node and
// attribute value goes through these.
// ---------------------------------------------------------------------------
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(value: string): string {
  // Attribute values are wrapped in double quotes; escape `&`, `"`, `<` (the
  // last is not strictly required but keeps the value safe in naive parsers).
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function attr(name: string, value: unknown): string {
  if (value === undefined || value === null) return "";
  const s = String(value);
  if (s === "") return "";
  return ` ${name}="${escapeAttr(s)}"`;
}

function attrs(pairs: Array<[string, unknown]>): string {
  return pairs.map(([n, v]) => attr(n, v)).join("");
}

/** Normalise a Lexical ElementFormatType (`format` on blocks) to a CSS
 *  `text-align` value, or `null` when it's the default (left/start/empty). */
function alignToTextAlign(format: unknown): string | null {
  if (typeof format !== "string") return null;
  switch (format) {
    case "right":
      return "right";
    case "center":
      return "center";
    case "justify":
      return "justify";
    case "end":
      return "right";
    default:
      return null; // "", "left", "start" → default, omit
  }
}

function styleAttr(decls: Array<[string, string | null | undefined]>): string {
  const valid = decls.filter(([, v]) => v) as Array<[string, string]>;
  if (valid.length === 0) return "";
  return ` style="${escapeAttr(valid.map(([p, v]) => `${p}: ${v}`).join("; "))}"`;
}

// ---------------------------------------------------------------------------
// Accept either a Lexical editor-state (`{ root }`), a raw `{ root }`-less
// container, or the SN note object whose `text` is a JSON string.
// ---------------------------------------------------------------------------
function toRoot(input: unknown): LexicalNode | null {
  if (!input || typeof input !== "object") return null;
  const obj = input as Record<string, unknown>;
  if (obj.root && typeof obj.root === "object") {
    return obj.root as LexicalNode;
  }
  // SN note object: `{ text: "<json string>" }` (or `content`).
  const text = typeof obj.text === "string" ? obj.text : typeof obj.content === "string" ? obj.content : null;
  if (text) {
    try {
      const parsed = JSON.parse(text);
      return toRoot(parsed);
    } catch {
      return null;
    }
  }
  // A bare root container (has `type:"root"` or `children`).
  const maybe = input as LexicalNode;
  if (maybe.type === "root" || Array.isArray(maybe.children)) return maybe;
  return null;
}

class Converter {
  private readonly resolvers: Resolvers;
  private readonly stats: ConvertStats = { attachments: 0, tags: 0, failed: [] };
  private readonly tagIds: string[] = [];
  /** Per-title tag cache so `resolveTag` is called once per unique title per
   *  note (the host resolver also de-dups, but this avoids redundant async
   *  calls and keeps the emitted chips + `tagIds` consistent). */
  private readonly tagCache = new Map<string, TagRef | null>();
  private firstHeading: string | null = null;
  private readonly explicitTitle: string | null;

  constructor(resolvers: Resolvers, explicitTitle?: string) {
    this.resolvers = resolvers;
    this.explicitTitle = explicitTitle ?? null;
  }

  async convert(editorState: unknown): Promise<ConvertResult> {
    const root = toRoot(editorState);
    if (!root || !Array.isArray(root.children)) {
      return { html: "", title: this.explicitTitle, tagIds: [], stats: this.stats };
    }
    const html = await this.walkBlocks(root.children);
    return {
      html,
      title: this.explicitTitle ?? this.firstHeading,
      tagIds: [...this.tagIds],
      stats: this.stats
    };
  }

  // ---- Block walk ----------------------------------------------------------
  private async walkBlocks(nodes: LexicalNode[]): Promise<string> {
    const out: string[] = [];
    for (const node of nodes) {
      out.push(await this.walkBlock(node));
    }
    return out.join("");
  }

  private async walkBlock(node: LexicalNode): Promise<string> {
    switch (node.type) {
      case "paragraph":
        return this.paragraph(node);
      case "heading":
        return this.heading(node);
      case "quote":
        return `<blockquote>${await this.walkBlocks(node.children ?? [])}</blockquote>`;
      case "list":
        return this.list(node);
      case "code":
        return this.codeBlock(node);
      case "horizontalrule":
        return "<hr>";
      case "table":
        return this.table(node);
      case "linebreak":
        return "<br>";
      // Inline nodes can appear at block level when SN wraps them in a
      // paragraph-less context; render them inline.
      default:
        return this.walkInline(node);
    }
  }

  private textAlign(node: LexicalNode): string {
    return styleAttr([["text-align", alignToTextAlign(node.format)]]);
  }

  private async paragraph(node: LexicalNode): Promise<string> {
    const inner = await this.walkInlineChildren(node.children ?? []);
    return `<p${this.textAlign(node)}>${inner}</p>`;
  }

  private async heading(node: LexicalNode): Promise<string> {
    const tag = (node.tag ?? "h1").replace(/[^h1-6]/g, "") || "h1";
    const inner = await this.walkInlineChildren(node.children ?? []);
    if (this.firstHeading === null && inner) {
      this.firstHeading = this.plainText(node.children ?? []);
    }
    return `<${tag}${this.textAlign(node)}>${inner}</${tag}>`;
  }

  private list(node: LexicalNode): Promise<string> {
    if (node.listType === "check") {
      // Check lists are flattened (see `checkList`) so a check list nested
      // inside a check item becomes indented task items in the SAME taskList
      // (data-indent), not a nested taskList — Notesnook renders a full header
      // (title/progress/clear) per taskList, so nesting taskLists would stack
      // headers ("a checklist within a checklist"). Bullet/number lists nested
      // under a check item stay nested (they have no header).
      return this.checkList(node.children ?? [], 0);
    }
    const tag = node.listType === "number" ? "ol" : "ul";
    return this.walkListItems(node.children ?? [], tag, "", false);
  }

  /**
   * Emit a check list as a single flat `<ul class="checklist">` whose items may
   * carry `data-indent` to express nesting. Nested check lists (a check item
   * containing a check list) are inlined as sibling task items with indent+1,
   * NOT as a nested taskList — so only one taskList header renders. An empty
   * check item that merely wraps a nested check list is dropped (its items
   * flatten as siblings). Nested bullet/number lists and inline content stay
   * inside their own `<li>`. Recursive calls return their `<li>`s (no `<ul>`)
   * so the top-level call wraps everything in one `<ul class="checklist">`.
   */
  private async checkList(items: LexicalNode[], indent: number): Promise<string> {
    const lis: string[] = [];
    for (const item of items) {
      if (item.type !== "listitem") {
        lis.push(`<li class="checklist--item">${await this.walkInlineChildren(item.children ?? [])}</li>`);
        continue;
      }
      const checked = item.checked === true;
      const children = item.children ?? [];
      // Partition: nested CHECK lists flatten as indented siblings; everything
      // else (inline text + nested bullet/number lists) stays inside this <li>.
      const inLi: LexicalNode[] = [];
      const nestedChecks: LexicalNode[] = [];
      for (const c of children) {
        if (c.type === "list" && c.listType === "check") nestedChecks.push(c);
        else inLi.push(c);
      }
      const liContent = await this.walkListItemContent(inLi, true);
      const indentAttr = indent > 0 ? ` data-indent="${indent}"` : "";
      // Emit the <li> only when it has its own content; an empty check item that
      // only wraps a nested check list is dropped (its items flatten below).
      if (liContent.length > 0) {
        lis.push(`<li class="checklist--item${checked ? " checked" : ""}"${indentAttr}>${liContent}</li>`);
      }
      for (const nc of nestedChecks) {
        lis.push(await this.checkList(nc.children ?? [], indent + 1));
      }
    }
    return indent === 0 ? `<ul class="checklist">${lis.join("")}</ul>` : lis.join("");
  }

  private async walkListItems(
    items: LexicalNode[],
    tag: string,
    listClass: string,
    isCheck: boolean
  ): Promise<string> {
    const lis: string[] = [];
    for (const item of items) {
      if (item.type !== "listitem") {
        // Unexpected; render as a fallback list item.
        lis.push(`<li>${await this.walkInlineChildren(item.children ?? [])}</li>`);
        continue;
      }
      const checked = item.checked === true;
      const itemClass = isCheck
        ? ` class="checklist--item${checked ? " checked" : ""}"`
        : "";
      const content = await this.walkListItemContent(item.children ?? [], isCheck);
      lis.push(`<li${itemClass}>${content}</li>`);
    }
    return `<${tag}${listClass}>${lis.join("")}</${tag}>`;
  }

  /** Walk a listitem's children: inline/text content first, then any nested
   *  `list` node rendered as a nested `<ul>/<ol>` inside the `<li>`. */
  private async walkListItemContent(children: LexicalNode[], isCheck: boolean): Promise<string> {
    const inline: LexicalNode[] = [];
    const nested: LexicalNode[] = [];
    for (const c of children) {
      if (c.type === "list") nested.push(c);
      else inline.push(c);
    }
    const inlineHtml = await this.walkInlineChildren(inline);
    let nestedHtml = "";
    for (const lst of nested) {
      nestedHtml += await this.list(lst);
    }
    return inlineHtml + nestedHtml;
  }

  private codeBlock(node: LexicalNode): string {
    const language = typeof node.language === "string" && node.language ? node.language : null;
    const classAttr = language ? ` class="language-${escapeAttr(language)}"` : "";
    const text = this.concatText(node.children ?? []);
    return `<pre${classAttr} data-indent-type="space" data-indent-length="2"><code>${escapeHtml(text)}</code></pre>`;
  }

  private async table(node: LexicalNode): Promise<string> {
    const rows: string[] = [];
    for (const child of node.children ?? []) {
      if (child.type === "tablerow") rows.push(await this.tableRow(child));
    }
    return `<table><tbody>${rows.join("")}</tbody></table>`;
  }

  private async tableRow(node: LexicalNode): Promise<string> {
    const cells: string[] = [];
    for (const child of node.children ?? []) {
      if (child.type === "tablecell") cells.push(await this.tableCell(child));
    }
    return `<tr>${cells.join("")}</tr>`;
  }

  private async tableCell(node: LexicalNode): Promise<string> {
    const isHeader = (node.headerState ?? HEADER_NO_STATUS) !== HEADER_NO_STATUS;
    const tag = isHeader ? "th" : "td";
    const cellAttrs: Array<[string, unknown]> = [];
    if (node.colSpan && node.colSpan > 1) cellAttrs.push(["colspan", node.colSpan]);
    if (node.rowSpan && node.rowSpan > 1) cellAttrs.push(["rowspan", node.rowSpan]);
    const style = styleAttr([["background-color", node.backgroundColor ?? null]]);
    // A Lexical tablecell holds multiple block children (paragraph/image/list).
    // Emit each as a block inside the cell — the lossless win over SN's
    // markdown export (which flattens cells to one line with literal `\n`).
    const inner = await this.walkBlocks(node.children ?? []);
    return `<${tag}${attrs(cellAttrs)}${style}>${inner}</${tag}>`;
  }

  // ---- Inline walk ---------------------------------------------------------
  private async walkInlineChildren(nodes: LexicalNode[]): Promise<string> {
    const out: string[] = [];
    for (const node of nodes) out.push(await this.walkInline(node));
    return out.join("");
  }

  private async walkInline(node: LexicalNode): Promise<string> {
    switch (node.type) {
      case "text":
        return this.text(node);
      case "linebreak":
        return "<br>";
      case "link":
      case "autolink":
        return this.link(node);
      case "hashtag":
        return this.hashtag(node);
      case "mark":
        return `<mark>${await this.walkInlineChildren(node.children ?? [])}</mark>`;
      case "overflow":
        return this.walkInlineChildren(node.children ?? []);
      case "snfile":
        return this.snfile(node);
      case "unencrypted-image":
        return this.remoteImage(node);
      case "inline-file":
        return this.inlineFile(node);
      case "youtube":
        return this.youtube(node);
      case "tweet":
        return this.tweet(node);
      case "snbubble":
        return this.snbubble(node);
      // Blocks appearing inline (rare): paragraph/list/table/code/hr inside a
      // link/hashtag context — delegate to the block walker.
      case "paragraph":
      case "heading":
      case "quote":
      case "list":
      case "code":
      case "horizontalrule":
      case "table":
        return this.walkBlock(node);
      default:
        // Unknown inline: best-effort unwrap of children, else drop.
        if (Array.isArray(node.children)) return this.walkInlineChildren(node.children);
        return "";
    }
  }

  private text(node: LexicalNode): string {
    const content = escapeHtml(node.text ?? "");
    const format = typeof node.format === "number" ? node.format : 0;
    if (!format) return content;
    // Open marks in fixed order, close in reverse.
    const open: string[] = [];
    const close: string[] = [];
    for (const m of MARK_ORDER) {
      if (format & m.bit) {
        open.push(`<${m.tag}>`);
        close.unshift(`</${m.tag}>`);
      }
    }
    return `${open.join("")}${content}${close.join("")}`;
  }

  private link(node: LexicalNode): Promise<string> {
    const href = node.url ?? "";
    const linkAttrs: Array<[string, unknown]> = [["href", href]];
    if (node.target) linkAttrs.push(["target", node.target]);
    if (node.rel) linkAttrs.push(["rel", node.rel]);
    if (node.title) linkAttrs.push(["title", node.title]);
    return this.walkInlineChildren(node.children ?? []).then(
      (inner) => `<a${attrs(linkAttrs)}>${inner}</a>`
    );
  }

  private async hashtag(node: LexicalNode): Promise<string> {
    const raw = node.text ?? "";
    const title = raw.replace(/^#+/, "").trim();
    if (!title) return escapeHtml(raw);
    const tag = await this.resolveTagSafe(title);
    if (!tag) return escapeHtml(raw);
    return `<span data-tag-id="${escapeAttr(tag.id)}" data-tag-title="${escapeAttr(tag.title)}"></span>`;
  }

  private async snfile(node: LexicalNode): Promise<string> {
    const ref = await this.resolveAttachmentSafe({ kind: "snfile", fileUuid: node.fileUuid ?? "" });
    if (!ref) return "";
    return this.mediaNode(ref, undefined);
  }

  private remoteImage(node: LexicalNode): string {
    // Remote URL image: keep the URL as `src` (not ingested as an attachment
    // for v1 — see plan). `alt` is lost (NN image schema has no alt attr).
    const src = node.src ?? "";
    const align = typeof node.format === "string" ? alignToTextAlign(node.format) : null;
    return `<img${attrs([["src", src], ["data-align", align ?? "left"]])}>`;
  }

  private async inlineFile(node: LexicalNode): Promise<string> {
    const ref = await this.resolveAttachmentSafe({
      kind: "inline",
      dataUrl: node.src ?? "",
      fileName: node.fileName ?? undefined,
      mime: node.mimeType ?? undefined
    });
    if (!ref) return "";
    return this.mediaNode(ref, undefined);
  }

  private youtube(node: LexicalNode): string {
    const id = node.videoID ?? "";
    const align = typeof node.format === "string" ? alignToTextAlign(node.format) : null;
    return `<iframe src="https://www.youtube-nocookie.com/embed/${escapeAttr(id)}"${attrs([["data-align", align ?? "left"]])}></iframe>`;
  }

  private tweet(node: LexicalNode): string {
    const id = node.id ?? "";
    const href = `https://x.com/i/web/status/${encodeURIComponent(id)}`;
    return `<a href="${escapeAttr(href)}">${escapeHtml(href)}</a>`;
  }

  private snbubble(node: LexicalNode): string {
    const uuid = node.itemUuid ?? "";
    return `<a href="nn://note/${escapeAttr(uuid)}">${escapeHtml(uuid)}</a>`;
  }

  // ---- Attachment → media node emission ------------------------------------
  /** Emit the right Notesnook node for a resolved attachment based on its MIME. */
  private mediaNode(ref: AttachmentRef, src: string | undefined): string {
    this.stats.attachments += 1;
    const mime = ref.mime || "";
    const common: Array<[string, unknown]> = [
      ["data-hash", ref.hash],
      ["data-filename", ref.filename],
      ["data-mime", mime],
      ["data-size", ref.size],
      ["data-align", "left"]
    ];
    if (ref.width) common.push(["width", ref.width]);
    if (ref.height) common.push(["height", ref.height]);
    if (ref.aspectRatio) common.push(["data-aspect-ratio", ref.aspectRatio]);
    if (src) common.push(["src", src]);

    if (mime.startsWith("image/")) {
      return `<img${attrs(common)}>`;
    }
    if (mime.startsWith("audio/")) {
      return `<audio${attrs(common)} controls></audio>`;
    }
    if (mime.startsWith("video/")) {
      return `<video${attrs(common)} controls></video>`;
    }
    // Non-media binary → attachment chip (inline atom).
    return `<span${attrs(common.filter(([n]) => n !== "data-align" && n !== "width" && n !== "height" && n !== "data-aspect-ratio"))}></span>`;
  }

  // ---- Resolver wrappers (record stats/failures) --------------------------
  private async resolveAttachmentSafe(input: AttachmentInput): Promise<AttachmentRef | null> {
    try {
      const ref = await this.resolvers.resolveAttachment(input);
      if (!ref) {
        this.stats.failed.push(`attachment ${input.kind === "snfile" ? input.fileUuid : input.dataUrl.slice(0, 40)}`);
      }
      return ref;
    } catch (e) {
      this.stats.failed.push(`attachment: ${String(e)}`);
      return null;
    }
  }

  private async resolveTagSafe(title: string): Promise<TagRef | null> {
    const norm = title.trim().toLowerCase();
    if (!norm) return null;
    const cached = this.tagCache.get(norm);
    if (cached !== undefined) {
      if (cached) this.stats.tags += 1;
      return cached;
    }
    try {
      const tag = await this.resolvers.resolveTag(title);
      if (!tag) {
        this.stats.failed.push(`tag ${title}`);
        this.tagCache.set(norm, null);
        return null;
      }
      this.tagCache.set(norm, tag);
      if (!this.tagIds.includes(tag.id)) this.tagIds.push(tag.id);
      this.stats.tags += 1;
      return tag;
    } catch (e) {
      this.stats.failed.push(`tag ${title}: ${String(e)}`);
      this.tagCache.set(norm, null);
      return null;
    }
  }

  // ---- Helpers -------------------------------------------------------------
  /** Concatenate all descendant text (for code blocks). */
  private concatText(nodes: LexicalNode[]): string {
    let out = "";
    for (const n of nodes) {
      if (typeof n.text === "string") out += n.text;
      if (Array.isArray(n.children)) out += this.concatText(n.children);
    }
    return out;
  }

  /** Plain-text rendering of a node's children (for title extraction). */
  private plainText(nodes: LexicalNode[]): string {
    let out = "";
    for (const n of nodes) {
      if (typeof n.text === "string") out += n.text;
      if (n.type === "hashtag" && typeof n.text === "string") out += n.text;
      if (Array.isArray(n.children)) out += this.plainText(n.children);
    }
    return out.trim();
  }
}

/**
 * Convert a Standard Notes Lexical editor-state to Notesnook TipTap HTML.
 *
 * @param editorState The Lexical editor-state (`{ root }`), the SN note object
 *   (`{ text: "<json>" }`), or the raw `note.text` JSON string.
 * @param resolvers Host-supplied attachment + tag resolution (idempotent per key).
 * @param explicitTitle SN `preview_title` — used as the note title in preference
 *   to the first heading.
 */
export async function lexicalToTipTapHtml(
  editorState: unknown,
  resolvers: Resolvers,
  explicitTitle?: string
): Promise<ConvertResult> {
  const converter = new Converter(resolvers, explicitTitle);
  return converter.convert(editorState);
}

// Re-export the types for callers.
export type {
  LexicalEditorState,
  LexicalNode,
  Resolvers,
  ConvertResult,
  ConvertStats,
  AttachmentInput,
  AttachmentRef,
  TagRef
} from "./types";