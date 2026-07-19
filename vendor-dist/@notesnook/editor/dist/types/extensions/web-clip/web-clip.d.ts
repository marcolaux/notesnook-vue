import { Node } from "@tiptap/core";
import { WebClipAttachment } from "../attachment/index.js";
export interface WebClipOptions {
    HTMLAttributes: Record<string, unknown>;
}
export type WebClipAttributes = WebClipAttachment & {
    fullscreen: boolean;
};
export declare const WebClipNode: Node<WebClipOptions, any>;
