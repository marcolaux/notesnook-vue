import { Node } from "@tiptap/pm/model";
import { Selection } from "@tiptap/pm/state";
export type CodeLine = {
    index: number;
    from: number;
    to: number;
    length: number;
    text: (length?: number) => string;
};
export type CaretPosition = {
    column: number;
    line: number;
    selected?: number;
    total: number;
    from: number;
};
export declare function toCodeLines(code: string, pos: number): CodeLine[];
export declare function toCaretPosition(selection: Selection, lines?: CodeLine[]): CaretPosition | undefined;
export declare function getLines(node: Node): CodeLine[];
