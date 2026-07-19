type OnTagHandler = (name: string, attr: Record<string, string>, pos: {
    start: number;
    end: number;
}) => false | {
    name: string;
    attr: Record<string, string>;
} | null | undefined | void;
export declare class HTMLRewriter {
    private transformed;
    private currentTag;
    private ignoreIndex;
    private parser;
    constructor(options?: {
        ontag?: OnTagHandler;
    });
    /**
     * @private
     */
    closeTag(): void;
    transform(html: string): string;
    end(): void;
    private write;
}
export {};
