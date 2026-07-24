/**
 * Fast 32-bit FNV-1a hash producing a deterministic hex string.
 * Used to compute `chunk_hash` for content-hash invalidation.
 */
export function fnv1aHash(str: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export interface TextChunk {
  index: number;
  text: string;
  hash: string;
}

/**
 * Strip HTML tags and decode common entities to plain text.
 */
export function stripHtml(html: string): string {
  if (!html) return "";
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Chunk a document into ~200-word segments (roughly ~256 tokens) with an overlap window.
 */
export function chunkText(rawContent: string, maxWords = 200, overlapWords = 20): TextChunk[] {
  const plainText = stripHtml(rawContent);
  if (!plainText) return [];

  const words = plainText.split(/\s+/);
  if (words.length === 0) return [];

  const chunks: TextChunk[] = [];
  let chunkIndex = 0;
  let start = 0;

  while (start < words.length) {
    const end = Math.min(words.length, start + maxWords);
    const chunkWords = words.slice(start, end);
    const chunkText = chunkWords.join(" ");
    
    if (chunkText.trim().length > 0) {
      const hash = fnv1aHash(chunkText);
      chunks.push({
        index: chunkIndex++,
        text: chunkText,
        hash
      });
    }

    if (end >= words.length) break;
    start += maxWords - overlapWords;
  }

  return chunks;
}
