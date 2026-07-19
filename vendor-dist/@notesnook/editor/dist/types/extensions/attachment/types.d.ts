export type BaseAttachment = {
    hash: string;
    filename: string;
    mime: string;
    size: number;
    progress?: number;
};
export type FileAttachment = BaseAttachment & {
    type: "file";
};
export type AudioAttachment = BaseAttachment & {
    type: "audio";
};
export type WebClipAttachment = BaseAttachment & {
    type: "web-clip";
    src: string;
    title: string;
    width?: string;
    height?: string;
};
export type ImageAttachment = BaseAttachment & {
    type: "image";
    width?: number;
    height?: number;
    src?: string;
    aspectRatio?: number;
} & ImageAlignmentOptions;
export type ImageAlignmentOptions = {
    float?: boolean;
    align?: "center" | "left" | "right";
};
export type Attachment = FileAttachment | AudioAttachment | WebClipAttachment | ImageAttachment;
