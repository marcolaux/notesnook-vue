export type TOCItem = {
    level: number;
    title: string;
    id: string;
    top: number;
};
export declare function getTableOfContents(content: HTMLElement): TOCItem[];
export declare function scrollIntoViewById(blockId: string, optionalStyles?: string): void;
