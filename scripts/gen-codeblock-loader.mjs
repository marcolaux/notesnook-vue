import { readFileSync, writeFileSync } from "node:fs";

const langs = JSON.parse(
  readFileSync("./packages/editor-vue/src/extensions/code-block/languages.json", "utf8")
);

const header = `/*
Generated from ./languages.json — one literal \`import("refractor/lang/<name>.js")\`
thunk per language. Literal-string dynamic imports are what Vite code-splits
into the lazy language chunks in the renderer build (the templated dynamic
import form is NOT statically analyzable by Vite and would not produce
per-language chunks). Mirrors the loader pattern in @notesnook/core.

Ported from @notesnook/editor (GPL-3.0), extensions/code-block/loader.ts +
languages/index.js.
*/
import type { Syntax } from "refractor/lib/core.js";

type LangModule = { default: Syntax };

const loaders: Record<string, () => Promise<LangModule>> = {
`;

const body = langs
  .map((l) => `  ${JSON.stringify(l.filename)}: () => import("refractor/lang/${l.filename}.js"),`)
  .join("\n");

const footer = `
};

const loadedLanguages: Record<string, boolean> = {};

export function isLanguageLoaded(name: string): boolean {
  return !!loadedLanguages[name];
}

export async function loadLanguage(shortName: string): Promise<Syntax | undefined> {
  const loader = loaders[shortName];
  if (!loader) return undefined;
  try {
    const mod = await loader();
    loadedLanguages[shortName] = true;
    return mod.default;
  } catch {
    loadedLanguages[shortName] = false;
    return undefined;
  }
}
`;

writeFileSync("./packages/editor-vue/src/extensions/code-block/loader.ts", header + body + "\n" + footer);
console.log(`wrote loader.ts: ${langs.length} loaders`);