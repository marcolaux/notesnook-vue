import { UnionCommands, Editor as TiptapEditor } from "@tiptap/core";
export type PermissionRequestEvent = CustomEvent<{
    id: keyof UnionCommands;
    silent: boolean;
}>;
export type LinkData = {
    type: "note" | "notebook" | "color" | "tag";
    title?: string;
    metadata?: Record<string, string | undefined>;
};
export declare class Editor extends TiptapEditor {
    private mutex;
    /**
     * Performs editor state changes in a thread-safe manner using a mutex
     * ensuring that all changes are applied sequentially. Use this when
     * you are getting `RangeError: Applying a mismatched transaction` errors.
     */
    threadsafe(callback: (editor: TiptapEditor) => void): Promise<void>;
}
export declare function hasPermission(id: keyof UnionCommands, silent?: boolean): boolean;
