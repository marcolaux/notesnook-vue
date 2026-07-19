import { Node } from "prosemirror-model";
import { EditorState, PluginKey, Transaction } from "prosemirror-state";
/**
 * @public
 */
export declare const fixTablesKey: PluginKey<{
    fixTables: boolean;
}>;
/**
 * Inspect all tables in the given state's document and return a
 * transaction that fixes them, if necessary. If `oldState` was
 * provided, that is assumed to hold a previous, known-good state,
 * which will be used to avoid re-scanning unchanged parts of the
 * document.
 *
 * @public
 */
export declare function fixTables(state: EditorState, oldState?: EditorState): Transaction | undefined;
export declare function fixTable(state: EditorState, table: Node, tablePos: number, tr: Transaction | undefined): Transaction | undefined;
