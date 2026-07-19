import { Node } from "@tiptap/core";
import { AudioAttachment } from "../attachment/index.js";
export interface AudioOptions {
    HTMLAttributes: Record<string, unknown>;
}
export type AudioAttributes = AudioAttachment;
declare module "@tiptap/core" {
    interface Commands<ReturnType> {
        audio: {
            insertAudio: (audio: AudioAttachment) => ReturnType;
        };
    }
}
export declare const AudioNode: Node<AudioOptions, any>;
