declare const InternalLinkTypes: readonly ["note", "notebook", "tag", "color"];
export type InternalLinkType = (typeof InternalLinkTypes)[number];
export type NoteLink = BaseInternalLink<"note">;
export type NotebookLink = BaseInternalLink<"notebook">;
export type TagLink = BaseInternalLink<"tag">;
export type ColorLink = BaseInternalLink<"color">;
type BaseInternalLink<T extends InternalLinkType = InternalLinkType, TParams extends InternalLinkParams[T] = InternalLinkParams[T]> = {
    type: T;
    id: string;
    params?: Partial<TParams>;
};
export type InternalLink = NoteLink | NotebookLink | TagLink | ColorLink;
export type InternalLinkWithOffset<T extends InternalLinkType = InternalLinkType> = BaseInternalLink<T> & {
    start: number;
    end: number;
    text: string;
};
type InternalLinkParams = {
    note: {
        blockId: string;
    };
    notebook: {};
    tag: {};
    color: {};
};
export declare function createInternalLink<T extends InternalLinkType>(type: T, id: string, params?: InternalLinkParams[T]): string;
export declare function parseInternalLink(link: string): InternalLink | undefined;
export declare function isInternalLink(link: string): boolean;
export declare function isNoteLink(link: string): boolean;
export {};
