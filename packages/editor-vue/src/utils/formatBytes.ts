/**
 * Human-readable byte size for the attachment chip display. Cosmetic only —
 * does not affect storage round-trip. (Upstream uses `formatBytes` from
 * `@notesnook/common`; reimplemented here to keep the package self-contained.)
 */
export function formatBytes(bytes: number, decimals = 1): string {
  if (!bytes || bytes <= 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  const value = bytes / Math.pow(k, i);
  return `${parseFloat(value.toFixed(decimals))} ${sizes[i]!}`;
}