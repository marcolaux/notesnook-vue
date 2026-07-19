export interface SearchSettings {
    matchCase: boolean;
    enableRegex: boolean;
    matchWholeWord: boolean;
}
export interface SearchState extends SearchSettings {
    isSearching: boolean;
    searchTerm: string;
    replaceTerm: string;
    focusNonce: number;
    isReplacing: boolean;
    isExpanded: boolean;
}
export interface MultiEditorSearchState {
    editors: Record<string, SearchState | undefined>;
    getSearchState: (editorId: string) => SearchState;
    setSearchState: (editorId: string, state: Partial<SearchState>) => void;
}
export declare const useEditorSearchStore: import("zustand").UseBoundStore<import("zustand").StoreApi<MultiEditorSearchState>>;
