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
 *
 * Phase 7.2: the English catalog + `toPseudo` moved to the shared
 * `@contracts/i18n` module so the main process can build the same pseudo
 * catalog; this file keeps the renderer's default export + re-exports
 * `toPseudo` for existing importers.
 */
import en from "@contracts/i18n/en";
import { toPseudo } from "@contracts/i18n";

export { toPseudo } from "@contracts/i18n";

/** The pseudo-locale catalog — `en` with every string wrapped. */
const pseudo = toPseudo(en);

export default pseudo;