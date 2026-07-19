import { Extension } from "@tiptap/core";
import { SearchSettings } from "../../toolbar/stores/search-store.js";
declare module "@tiptap/core" {
    interface Commands<ReturnType> {
        searchreplace: {
            startSearch: (isReplacing?: boolean) => ReturnType;
            endSearch: () => ReturnType;
            search: (term: string, options?: SearchSettings) => ReturnType;
            moveToNextResult: () => ReturnType;
            moveToPreviousResult: () => ReturnType;
            replace: (term: string) => ReturnType;
            replaceAll: (term: string) => ReturnType;
        };
    }
}
interface Result {
    from: number;
    to: number;
}
interface SearchOptions {
    searchResultClass: string;
    onStartSearch: (term?: string, isReplacing?: boolean) => boolean;
    onEndSearch: () => boolean;
}
export type SearchStorage = {
    selectedIndex: number;
    selectedText?: string;
    results?: Result[];
};
export declare const SearchReplace: Extension<SearchOptions, SearchStorage>;
export {};
