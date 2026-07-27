#!/usr/bin/env node
/**
 * i18n `.po` round-trip (Phase 7.2) — gettext-style export/import for the
 * locale catalogs in `src/contracts/i18n/`. No npm dep; a hand-rolled parser +
 * serializer. Lets a human translator review/edit a machine-translated locale
 * (e.g. `de`) without touching TypeScript:
 *
 *   1. `node scripts/i18n-po.mjs export en`   → `contracts/i18n/po/en.po`
 *      (English reference — translators read these `msgstr`s as the source)
 *   2. `node scripts/i18n-po.mjs export de`   → `contracts/i18n/po/de.po`
 *      (each entry carries an `# en:` comment with the English source)
 *   3. translator edits `de.po` `msgstr`s
 *   4. `node scripts/i18n-po.mjs import de`   → regenerates `contracts/i18n/de.ts`
 *
 * `msgid` is the dotted catalog key (`menu.file`); array leaves round-trip as
 * `key[0]`…`key[n]` (e.g. `reminder.weekdays[0]`). Sparse `.po`s (only some
 * keys translated) import to a sparse catalog — vue-i18n's `fallbackLocale`
 * fills the gaps, and the main-process `translate` falls back to `en` per-key.
 *
 * Reading the `.ts` catalog: the file is a plain `export default {...} as
 * const;` object literal with no logic, so it is loaded with `new Function`
 * (not `import()` — node can't import `.ts` directly and we add no dep).
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const I18N_DIR = resolve(__dirname, "..", "src", "contracts", "i18n");
const PO_DIR = join(I18N_DIR, "po");

const usage = `Usage:
  node scripts/i18n-po.mjs export <locale>        write contracts/i18n/po/<locale>.po
  node scripts/i18n-po.mjs import <locale> [file] regenerate contracts/i18n/<locale>.ts
`;

/** Load a catalog `.ts` file's default export (plain object literal). */
function loadCatalog(locale) {
  const file = join(I18N_DIR, `${locale}.ts`);
  const src = readFileSync(file, "utf-8");
  // Strip `export default ` and trailing ` as const;` (optional whitespace),
  // then evaluate the object literal. Safe: the catalogs contain only strings,
  // arrays, and nested objects — no identifiers or expressions.
  const match = src.match(/export\s+default\s+([\s\S]*?)\s*(?:as\s+const\s*)?;?\s*$/);
  if (!match) throw new Error(`${file}: no \`export default {...}\` found`);
  try {
    return new Function(`return (${match[1]});`)();
  } catch (err) {
    throw new Error(`${file}: failed to parse object literal — ${err.message}`);
  }
}

/** Flatten a nested catalog to `dotted.key → leaf` (arrays → `key[i]`). */
function flatten(obj, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (Array.isArray(v)) v.forEach((item, i) => (out[`${key}[${i}]`] = String(item)));
    else if (v && typeof v === "object") flatten(v, key, out);
    else out[key] = String(v);
  }
  return out;
}

/** Set a dotted key (with optional `[i]` segments) into a nested object. */
function setDeep(root, dottedKey, value) {
  const parts = dottedKey.split(".");
  let cur = root;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const m = part.match(/^(.+)\[(\d+)\]$/);
    const last = i === parts.length - 1;
    if (m) {
      const name = m[1];
      const idx = Number(m[2]);
      if (last) {
        cur[name] ??= [];
        cur[name][idx] = value;
      } else {
        cur[name] ??= [];
        cur[name][idx] ??= {};
        cur = cur[name][idx];
      }
    } else if (last) {
      cur[part] = value;
    } else {
      cur[part] ??= {};
      cur = cur[part];
    }
  }
}

/** Escape a `.po` string literal body (backslash, double-quote, newline). */
function poEscape(s) {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

/** Serialize a `{key: value}` map to gettext `.po` text, optionally with an
 *  `# en:` reference comment per entry (from `enRef`). */
function serialize(flat, enRef) {
  const header = [
    `# Notesnook Vue locale catalog — ${enRef ? "reference" : "translation"}.`,
    `# msgid = dotted catalog key; msgstr = localized text. Edit msgstr only.`,
    `# Array leaves use key[0]…key[n] (e.g. reminder.weekdays[0]).`,
    `msgid ""`,
    `msgstr ""`,
    `"Content-Type: text/plain; charset=UTF-8\\n"`,
    ""
  ].join("\n");
  const body = Object.keys(flat)
    .sort()
    .map((key) => {
      const ref = enRef ? `# en: ${poEscape(enRef[key] ?? "")}\n` : "";
      return `${ref}msgid "${poEscape(key)}"\nmsgstr "${poEscape(flat[key])}"\n`;
    })
    .join("\n");
  return `${header}\n${body}`;
}

/** Parse gettext `.po` text → `{msgid: msgstr}` map (multi-line + escapes). */
function parse(po) {
  const out = {};
  let msgid = null;
  let msgstr = null;
  let field = null; // "msgid" | "msgstr"
  const unescape = (s) => s.replace(/\\"/g, '"').replace(/\\n/g, "\n").replace(/\\\\/g, "\\");
  for (const line of po.split("\n")) {
    const idMatch = line.match(/^msgid\s+"(.*)"\s*$/);
    const strMatch = line.match(/^msgstr\s+"(.*)"\s*$/);
    const contMatch = line.match(/^\s+"(.*)"\s*$/);
    if (idMatch) {
      if (msgid !== null && msgstr !== null) out[unescape(msgid)] = unescape(msgstr);
      msgid = idMatch[1];
      msgstr = "";
      field = "msgid";
    } else if (strMatch) {
      msgstr = strMatch[1];
      field = "msgstr";
    } else if (contMatch && field) {
      if (field === "msgid") msgid += contMatch[1];
      else msgstr += contMatch[1];
    } else if (line.trim() === "" || line.startsWith("#")) {
      if (msgid !== null && msgstr !== null && field === "msgstr") {
        out[unescape(msgid)] = unescape(msgstr);
        msgid = null;
        msgstr = null;
        field = null;
      }
    }
  }
  if (msgid !== null && msgstr !== null) out[unescape(msgid)] = unescape(msgstr);
  return out;
}

/** Render a nested catalog object as a TypeScript `export default {...} as
 *  const;` source file with a banner. */
function renderTs(obj, locale, banner) {
  const body = JSON.stringify(obj, null, 2);
  return `${banner}\nexport default ${body} as const;\n`;
}

function cmdExport(locale) {
  const catalog = loadCatalog(locale);
  const flat = flatten(catalog);
  const enRef = locale === "en" ? null : flatten(loadCatalog("en"));
  mkdirSync(PO_DIR, { recursive: true });
  const out = join(PO_DIR, `${locale}.po`);
  writeFileSync(out, serialize(flat, enRef), "utf-8");
  console.log(`wrote ${out} (${Object.keys(flat).length} entries)`);
}

function cmdImport(locale, file) {
  const poPath = file ? resolve(file) : join(PO_DIR, `${locale}.po`);
  const po = readFileSync(poPath, "utf-8");
  const map = parse(po);
  const root = {};
  for (const [key, value] of Object.entries(map)) {
    if (value === "") continue; // untranslated → leave sparse (fallback to en)
    setDeep(root, key, value);
  }
  const banner =
    `/**\n * ${locale} message catalog (Phase 7.2) — generated from ` +
    `${poPath.replace(I18N_DIR + "/", "")} by \`npm run i18n:po import ${locale}\`.\n` +
    ` * Edit the \`.po\`, not this file. ⚠️ If this is a machine-translated\n` +
    ` * locale, it has NOT been reviewed by a native speaker — do not ship a\n` +
    ` * public release without a human review pass. Sparse keys fall back to\n` +
    ` * English via vue-i18n's \`fallbackLocale\` + the main-process \`translate\`\n` +
    ` * per-key fallback.\n` +
    ` */\n`;
  const out = join(I18N_DIR, `${locale}.ts`);
  writeFileSync(out, renderTs(root, locale, banner), "utf-8");
  console.log(`wrote ${out} (${Object.keys(map).filter((k) => map[k] !== "").length} entries)`);
}

const [, , sub, localeArg, fileArg] = process.argv;
if (!sub || !localeArg) {
  console.error(usage);
  process.exit(1);
}
if (sub === "export") cmdExport(localeArg);
else if (sub === "import") cmdImport(localeArg, fileArg);
else {
  console.error(usage);
  process.exit(1);
}