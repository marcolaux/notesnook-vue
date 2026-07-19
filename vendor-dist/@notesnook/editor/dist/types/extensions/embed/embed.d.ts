import { Node } from "@tiptap/core";
import { TextDirections } from "../text-direction/index.js";
export interface EmbedOptions {
    HTMLAttributes: Record<string, unknown>;
}
export type EmbedAttributes = Partial<EmbedSizeOptions> & {
    src: string;
};
export type EmbedAlignmentOptions = {
    align?: "center" | "left" | "right";
    textDirection?: TextDirections;
};
export type Embed = Required<EmbedAttributes> & EmbedAlignmentOptions;
export type EmbedSizeOptions = {
    width: number;
    height: number;
};
declare module "@tiptap/core" {
    interface Commands<ReturnType> {
        embed: {
            /**
             * Add an embed
             */
            insertEmbed: (options: EmbedAttributes) => ReturnType;
            setEmbedAlignment: (options: EmbedAlignmentOptions) => ReturnType;
            setEmbedSize: (options: EmbedSizeOptions) => ReturnType;
            setEmbedSource: (src: string) => ReturnType;
        };
    }
}
export declare const EmbedNode: Node<EmbedOptions, any>;
