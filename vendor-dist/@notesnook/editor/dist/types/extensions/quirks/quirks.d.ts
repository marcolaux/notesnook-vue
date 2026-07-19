import { Extension } from "@tiptap/core";
export type QuirksOptions = {
    /**
     * List of node types that do not get removed on pressing Backspace
     * even when they are empty.
     */
    irremovableNodesOnBackspace: string[];
    /**
     * Nodes that should be easily escapable if at the beginning of the
     * document by pressing the ArrowUp key. Pressing the ArrowUp key
     * will create an empty paragraph before the node.
     */
    escapableNodesIfAtDocumentStart: string[];
};
export declare const Quirks: Extension<QuirksOptions, any>;
