import Database from "./index.js";
import { HighlightedResult, Match, Note, Notebook, Reminder, SortOptions, TrashItem } from "../types.js";
import { FilteredSelector } from "../database/sql-collection.js";
import { VirtualizedGrouping } from "../utils/virtualized-grouping.js";
type SearchResults<T> = {
    sorted: (sortOptions?: SortOptions) => Promise<VirtualizedGrouping<T>>;
    items: (limit?: number, sortOptions?: SortOptions) => Promise<T[]>;
    ids: (limit?: number, sortOptions?: SortOptions) => Promise<string[]>;
};
export default class Lookup {
    private readonly db;
    constructor(db: Database);
    notes(query: string, notes?: FilteredSelector<Note>): SearchResults<Note>;
    notesWithHighlighting(query: string, notes: FilteredSelector<Note>, sortOptions?: SortOptions): Promise<VirtualizedGrouping<HighlightedResult>>;
    private ftsQueryBuilder;
    private regexQueryBuilder;
    notebooks(query: string): SearchResults<Notebook>;
    tags(query: string): SearchResults<import("../types.js").Tag>;
    reminders(query: string): SearchResults<Reminder>;
    trash(query: string): SearchResults<TrashItem>;
    attachments(query: string): SearchResults<import("../types.js").Attachment>;
    private search;
    private filter;
    private toSearchResults;
    private filterTrash;
    private toVirtualizedGrouping;
    private toItems;
    rebuild(): Promise<void>;
}
export declare function splitHighlightedMatch(text: string): Match[][];
export {};
