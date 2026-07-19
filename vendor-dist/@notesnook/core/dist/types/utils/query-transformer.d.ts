type ASTNode = QueryNode | PhraseNode | OperatorNode | FieldPhraseNode;
type QueryNode = {
    type: "query";
    children: ASTNode[];
};
type PhraseNode = {
    type: "phrase";
    value: string[];
};
type FieldPhraseNode = {
    type: "field_phrase";
    field: string;
    value: QueryNode;
};
type OperatorNode = {
    type: "AND" | "OR" | "NOT";
};
declare const SUPPORTED_FIELDS: {
    title: (ast: (QueryNode | FieldPhraseNode)[]) => {
        query: string;
        tokens: QueryTokens;
    } | undefined;
    content: (ast: (QueryNode | FieldPhraseNode)[]) => {
        query: string;
        tokens: QueryTokens;
    } | undefined;
    tag: (ast: (QueryNode | FieldPhraseNode)[]) => string[] | null;
    color: (ast: (QueryNode | FieldPhraseNode)[]) => string[] | null;
    edited_before: (ast: (QueryNode | FieldPhraseNode)[]) => number | null;
    edited_after: (ast: (QueryNode | FieldPhraseNode)[]) => number | null;
    created_before: (ast: (QueryNode | FieldPhraseNode)[]) => number | null;
    created_after: (ast: (QueryNode | FieldPhraseNode)[]) => number | null;
    pinned: (ast: (QueryNode | FieldPhraseNode)[]) => boolean | null;
    locked: (ast: (QueryNode | FieldPhraseNode)[]) => boolean | null;
    readonly: (ast: (QueryNode | FieldPhraseNode)[]) => boolean | null;
    favorite: (ast: (QueryNode | FieldPhraseNode)[]) => boolean | null;
    archived: (ast: (QueryNode | FieldPhraseNode)[]) => boolean | null;
    tagged: (ast: (QueryNode | FieldPhraseNode)[]) => boolean | null;
    colored: (ast: (QueryNode | FieldPhraseNode)[]) => boolean | null;
    in_notebook: (ast: (QueryNode | FieldPhraseNode)[]) => boolean | null;
};
export declare function transformQuery(query: string): {
    [K in keyof typeof SUPPORTED_FIELDS]?: ReturnType<(typeof SUPPORTED_FIELDS)[K]>;
} & {
    filters: number;
};
export interface QueryTokens {
    andTokens: string[];
    orTokens: string[];
    notTokens: string[];
}
export {};
