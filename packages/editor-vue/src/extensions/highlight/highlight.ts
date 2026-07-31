/**
 * Highlight mark (Phase 5.3) — a thin extension over the standard TipTap
 * `@tiptap/extension-highlight` that re-exports its behaviour while dropping
 * the inline `color: inherit` the base multicolor `renderHTML` bakes onto
 * `<mark data-color="…">`.
 *
 * The base extension renders a coloured highlight as
 * `style="background-color: <color>; color: inherit"`. The `color: inherit`
 * forces the text to keep the theme text colour regardless of the highlight
 * background, which washes out on light highlights in dark themes (light text
 * on yellow) and on dark highlights in light themes (dark text on dark blue).
 * Because it is inline it beats every stylesheet rule, so contrast can't be
 * fixed from CSS alone.
 *
 * Here we override only the `color` attribute's `renderHTML` to emit the
 * background + `data-color` **without** the inline text colour, handing text
 * colour back to CSS. The consumer stylesheet
 * (`apps/desktop/.../style.css`) maps each preset swatch's `data-color` to a
 * `--hl-text-*` CSS variable emitted per-theme by `@notesnook-vue/theme-vue`'s
 * `highlightToCSS` — which reuses the block-colorize WCAG/OKLCH contrast engine
 * (`adjustForContrast`) so highlighted text stays readable against its
 * highlight background in any theme. Custom (OS-picker) colours and the
 * default (no-colour) highlight fall back to `color: inherit` in CSS.
 *
 * TipTap's `getExtensionField` only consults a child's `addAttributes` when the
 * child defines it, so the parent's `color` attribute is NOT merged in — we
 * replicate the full attribute (`default` + `parseHTML` + `renderHTML`), only
 * changing `renderHTML`. Everything else (commands, input/paste rules, the
 * `mark` tag, `Mod-Shift-h`, `.configure({ multicolor: true })`) is inherited
 * unchanged. No document-format change: the mark still carries `color` /
 * `data-color` / `background-color`; only the inline text colour is removed.
 *
 * Pinned to `@tiptap/extension-highlight@2.6.6` via the root `overrides` so it
 * shares one ProseMirror core with the rest of the editor (see index.ts header).
 */
import { Highlight as BaseHighlight } from "@tiptap/extension-highlight";
export type { HighlightOptions } from "@tiptap/extension-highlight";

export const Highlight = BaseHighlight.extend({
  addAttributes() {
    if (!this.options.multicolor) return {};
    return {
      color: {
        default: null,
        parseHTML: (element: HTMLElement) =>
          element.getAttribute("data-color") || element.style.backgroundColor,
        renderHTML: (attributes: { color: string | null }) => {
          if (!attributes.color) return {};
          return {
            "data-color": attributes.color,
            // No `color: inherit` — CSS drives the text colour per
            // `data-color` for contrast-aware highlighting.
            style: `background-color: ${attributes.color}`
          };
        }
      }
    };
  }
});