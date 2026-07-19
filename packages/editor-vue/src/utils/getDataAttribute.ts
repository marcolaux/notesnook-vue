/*
Ported from @notesnook/editor (GPL-3.0), extensions/attachment/attachment.ts.
Wires a TipTap node attribute to a `data-*` HTML attribute so notes round-trip
byte-for-byte with the upstream editor's storage format.
*/
export function getDataAttribute(name: string, def?: unknown): {
  default: unknown;
  parseHTML: (element: HTMLElement) => string | undefined;
  renderHTML: (attributes: Record<string, unknown>) => Record<string, unknown>;
} {
  return {
    default: def,
    parseHTML: (element) => element.dataset[name],
    renderHTML: (attributes) => {
      const value = attributes[name];
      if (!value) return {};
      return { [`data-${name}`]: value };
    }
  };
}