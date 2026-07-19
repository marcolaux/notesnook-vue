import { Slice } from "prosemirror-model";
import { Command } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
type Axis = "horiz" | "vert";
/**
 * @public
 */
export type Direction = -1 | 1;
export declare const handleKeyDown: (view: EditorView, event: KeyboardEvent) => boolean;
/**
 * @internal
 */
export declare function arrow(axis: Axis, dir: Direction): Command;
export declare function handleTripleClick(view: EditorView, pos: number): boolean;
/**
 * @public
 */
export declare function handlePaste(view: EditorView, _: ClipboardEvent, slice: Slice): boolean;
export declare function handleMouseDown(view: EditorView, startEvent: MouseEvent | TouchEvent): void;
export {};
