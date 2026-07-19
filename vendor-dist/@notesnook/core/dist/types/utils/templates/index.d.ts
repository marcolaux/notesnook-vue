import { Note } from "../../types.js";
export type TemplateData = Omit<Note, "tags" | "color"> & {
    tags?: string[];
    color?: string;
    content: string;
};
export declare function buildFromTemplate(format: "md" | "txt" | "html" | "md-frontmatter", data: TemplateData): Promise<string>;
