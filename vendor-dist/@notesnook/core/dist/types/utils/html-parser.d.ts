export declare const parseHTML: (input: string) => Document | null;
export declare const sanitizeHtml: (html: string) => string;
export declare function getDummyDocument(): Document | null;
export declare function getInnerText(element: HTMLElement): string;
export declare function normalizeToHtmlBody(input: string): string;
export declare function extractHeadline(html: string, characterLimit: number): string;
export declare function extractTitle(html: string, characterLimit: number): string;
type OnTagHandler = (name: string, attr: Record<string, string>, pos: {
    start: number;
    end: number;
}) => void;
export declare class HTMLParser {
    private parser;
    constructor(options?: {
        ontag?: OnTagHandler;
    });
    parse(html: string): void;
}
export declare function extractMatchingBlocks(html: string, matchTagName: string): string[];
export {};
