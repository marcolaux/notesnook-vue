import { Plugin } from "prosemirror-state";
import { DecorationSet } from "prosemirror-view";
import { ReplaceAroundStep, ReplaceStep } from "prosemirror-transform";
export type ReplaceMergedStep = ReplaceAroundStep | ReplaceStep;
type HighlighterState = {
    decorations: DecorationSet;
    languages: Record<string, string>;
};
export declare function HighlighterPlugin({ name, defaultLanguage }: {
    name: string;
    defaultLanguage: () => string | null | undefined;
}): Plugin<HighlighterState>;
export {};
