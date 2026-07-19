import { Node } from "@tiptap/core";
import { ImageAlignmentOptions, ImageAttachment } from "../attachment/index.js";
import { TextDirections } from "../text-direction/index.js";
export interface ImageOptions {
    inline: boolean;
    allowBase64: boolean;
    HTMLAttributes: Record<string, unknown>;
}
export type ImageAttributes = ImageAttachment & {
    textDirection?: TextDirections;
};
export type ImageSize = {
    width: number;
    height: number;
};
declare module "@tiptap/core" {
    interface Commands<ReturnType> {
        image: {
            /**
             * Add an image
             */
            insertImage: (...options: Partial<ImageAttributes>[]) => ReturnType;
            setImageAlignment: (options: ImageAlignmentOptions) => ReturnType;
            setImageSize: (size: ImageSize) => ReturnType;
        };
    }
}
export declare const ImageNode: Node<ImageOptions, any>;
