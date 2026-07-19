import { EditorOptions, getHTMLFromFragment } from "@tiptap/core";
import { LinkAttributes } from "./extensions/link/index.js";
import { Attachment, AttachmentType } from "./extensions/attachment/index.js";
import { DateTimeOptions } from "./extensions/date-time/index.js";
import { ImageOptions } from "./extensions/image/index.js";
import { WebClipOptions } from "./extensions/web-clip/index.js";
import { AudioOptions } from "./extensions/audio/index.js";
import { usePermissionHandler } from "./hooks/use-permission-handler.js";
import Toolbar from "./toolbar/index.js";
import { DownloadOptions } from "./utils/downloader.js";
import { getChangedNodes } from "./utils/prosemirror.js";
import { LinkData } from "./types.js";
interface TiptapStorage {
    dateFormat?: DateTimeOptions["dateFormat"];
    timeFormat?: DateTimeOptions["timeFormat"];
    dayFormat?: DateTimeOptions["dayFormat"];
    openLink?: (url: string, openInNewTab?: boolean) => void;
    getLinkData?: (url: string) => Promise<LinkData | undefined>;
    downloadAttachment?: (attachment: Attachment) => void;
    openAttachmentPicker?: (type: AttachmentType) => void;
    previewAttachment?: (attachment: Attachment) => void;
    copyToClipboard?: (text: string, html?: string) => void;
    downloadCsvTable?: (csv: string) => void;
    createInternalLink?: (attributes?: LinkAttributes) => Promise<LinkAttributes | undefined>;
    getAttachmentData: ((attachment: Pick<Attachment, "hash" | "type">) => Promise<string | undefined>) | undefined;
}
declare module "@tiptap/core" {
    interface EditorStorage extends TiptapStorage {
    }
}
declare global {
    var keyboardShown: boolean;
}
export type TiptapOptions = EditorOptions & Omit<WebClipOptions, "HTMLAttributes"> & Omit<AudioOptions, "HTMLAttributes"> & Omit<ImageOptions, "HTMLAttributes"> & DateTimeOptions & TiptapStorage & {
    downloadOptions?: DownloadOptions;
    isMobile?: boolean;
    doubleSpacedLines?: boolean;
    enableFontLigatures?: boolean;
    id?: string;
} & {
    placeholder: string;
};
declare const useTiptap: (options: Partial<TiptapOptions>, deps?: React.DependencyList) => import("./types.js").Editor;
export { type Fragment } from "prosemirror-model";
export { type Attachment, type AttachmentType } from "./extensions/attachment/index.js";
export { type ImageAttributes } from "./extensions/image/index.js";
export { type LinkAttributes } from "./extensions/link/index.js";
export * from "./toolbar/index.js";
export * from "./types.js";
export * from "./utils/word-counter.js";
export * from "./utils/font.js";
export * from "./utils/toc.js";
export * from "./utils/downloader.js";
export { useTiptap, Toolbar, usePermissionHandler, getHTMLFromFragment, getChangedNodes, type DownloadOptions };
export { replaceDateTime } from "./extensions/date-time/index.js";
export type * from "./extension-imports.js";
export { type Selection } from "@tiptap/pm/state";
