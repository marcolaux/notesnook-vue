/**
 * Vendored port of `@notesnook/theme`'s `validateTheme` (upstream
 * `dist/index.mjs:1280-1360`), so the contract test can assert the schema
 * validator stays in sync without importing `@notesnook/theme` at runtime.
 */
import type { VueTheme } from "./types";
import { Variants } from "./theme-to-css";

// Upstream runtime order/shape.
const COLORS = [
  "accent",
  "paragraph",
  "background",
  "border",
  "heading",
  "icon",
  "separator",
  "placeholder",
  "hover",
  "accentForeground",
  "backdrop"
] as const;
const ALPHA_COLORS = [
  "hover",
  "backdrop",
  "background",
  "placeholder",
  "textSelection",
  "shade"
] as const;
const DEPRECATED_COLORS = ["shade", "textSelection"] as const;

const HEX_COLOR_REGEX = /^#(?:[0-9a-fA-F]{3}){1,2}$/;
const HEX_COLOR_REGEX_ALPHA = /^#(?:(?:[\da-fA-F]{3}){1,2}|(?:[\da-fA-F]{4}){1,2})$/;
const ID_REGEX = /^[a-z0-9_-]+$/;

const RequiredKeys: readonly string[] = [
  "version",
  "id",
  "name",
  "license",
  "authors.0.name",
  "description",
  "colorScheme",
  "compatibilityVersion",
  ...Variants.flatMap((variant) =>
    COLORS.map((colorName) => `scopes.base.${variant}.${colorName}`)
  )
];

type FlatObject = Record<string, unknown>;

function flatten(object: FlatObject): FlatObject {
  const flattenedObject: FlatObject = {};
  for (const innerObj in object) {
    const value = object[innerObj];
    if (typeof value === "function") continue;
    if (typeof value === "object" && value !== null) {
      const newObject = flatten(value as FlatObject);
      for (const key in newObject) {
        flattenedObject[`${innerObj}.${key}`] = newObject[key];
      }
    } else {
      flattenedObject[innerObj] = value;
    }
  }
  return flattenedObject;
}

export type ThemeValidationResult = { error: string | undefined };

/** Verbatim port. `json` accepts a partial theme (or a `VueTheme`). */
export function validateTheme(json: Partial<VueTheme>): ThemeValidationResult {
  const flattenedTheme = flatten(json as FlatObject);
  const missingKeys: string[] = [];
  for (const key of RequiredKeys) {
    if (!Object.keys(flattenedTheme).includes(key)) {
      missingKeys.push(key);
    }
  }
  if (missingKeys.length > 0) {
    return {
      error: `Invalid theme. ${missingKeys.join(",")} are missing from the theme.`
    };
  }
  if (!json.id || !ID_REGEX.test(json.id)) {
    return {
      error: `Invalid theme. ID of theme must contain only alphanumeric characters, - & _.`
    };
  }
  const invalidColors: string[] = [];
  for (const key in flattenedTheme) {
    if (!key.startsWith("scopes")) continue;
    const keyPart = key.split(".").pop();
    if (
      !keyPart ||
      (!COLORS.includes(keyPart as (typeof COLORS)[number]) &&
        !DEPRECATED_COLORS.includes(keyPart as (typeof DEPRECATED_COLORS)[number]))
    ) {
      return { error: `Invalid theme. Found unknown key: ${key}.` };
    }
    const value = flattenedTheme[key];
    const isAlpha = ALPHA_COLORS.includes(keyPart as (typeof ALPHA_COLORS)[number]);
    const isHexColor = typeof value === "string" && HEX_COLOR_REGEX.test(value);
    const isAlphaHexColor =
      typeof value === "string" && HEX_COLOR_REGEX_ALPHA.test(value);
    if ((!isAlpha && !isHexColor) || (isAlpha && !isAlphaHexColor)) {
      if (!isHexColor) invalidColors.push(key);
    }
  }
  if (invalidColors.length > 0) {
    return {
      error: `Invalid theme. ${invalidColors.join(", ")} have invalid values.`
    };
  }
  return { error: undefined };
}