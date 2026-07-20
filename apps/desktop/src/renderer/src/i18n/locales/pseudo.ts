/**
 * Pseudo-locale catalog (Phase 2.6 / 7.1) — generated from the English catalog
 * so every key is present (the app stays fully usable in pseudo) while making
 * any untranslated string visibly obvious. Mirrors upstream's
 * `pseudo-LOCALE.po` dev affordance.
 *
 * Each leaf string is wrapped in guillemets (`⟪…⟫`); a real pseudo-locale would
 * also extend vowels / pad length to surface layout issues, but the wrap alone
 * is enough to spot a missed `t()` call during dev. Regenerated from `./en` at
 * build time via {@link toPseudo} so it never drifts as keys are added.
 */
import en from "./en";

/** Recursively wrap every string leaf of a message catalog in guillemets. */
export function toPseudo<T>(messages: T): T {
  if (typeof messages === "string") return `⟪${messages}⟫` as unknown as T;
  if (Array.isArray(messages)) return messages.map((m) => toPseudo(m)) as unknown as T;
  if (messages && typeof messages === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(messages as Record<string, unknown>)) {
      out[key] = toPseudo(value);
    }
    return out as unknown as T;
  }
  return messages;
}

/** The pseudo-locale catalog — `en` with every string wrapped. */
const pseudo = toPseudo(en);

export default pseudo;