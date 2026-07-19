import { Node } from "@tiptap/core";
import { Attribute } from "@tiptap/core";
import { Attachment } from "./types.js";
export type AttachmentType = "image" | "file" | "camera";
export interface AttachmentOptions {
    types: string[];
    HTMLAttributes: Record<string, unknown>;
}
declare module "@tiptap/core" {
    interface Commands<ReturnType> {
        attachment: {
            insertAttachment: (...attachment: Attachment[]) => ReturnType;
            removeAttachment: () => ReturnType;
            updateAttachment: (attachment: Partial<Attachment>, options: {
                preventUpdate?: boolean;
                ignoreEdit?: boolean;
                query: (attachment: Attachment) => boolean;
            }) => ReturnType;
        };
    }
}
export declare const AttachmentNode: Node<AttachmentOptions, any>;
export declare function getDataAttribute(name: string, def?: unknown | null): Partial<Attribute>;
