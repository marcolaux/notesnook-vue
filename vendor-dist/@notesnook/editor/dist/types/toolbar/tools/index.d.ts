import React from "react";
import { ToolProps } from "../types.js";
import { Bold, Italic, Underline, Strikethrough, Code, Subscript, Superscript, ClearFormatting, CodeRemove, Math } from "./inline.js";
import { InsertBlock } from "./block.js";
import { FontSize, FontFamily } from "./font.js";
import { Alignment } from "./alignment.js";
import { Headings } from "./headings.js";
import { NumberedList, BulletList, Outdent, Indent, CheckList } from "./lists.js";
import { TextDirection } from "./text-direction.js";
import { Highlight, TextColor } from "./colors.js";
import { TableSettings, ColumnProperties, RowProperties, CellProperties, CellBackgroundColor, CellBorderColor, CellTextColor, CellBorderWidth } from "./table.js";
import { ImageSettings, ImageAlignCenter, ImageAlignLeft, ImageAlignRight, ImageProperties } from "./image.js";
import { AttachmentSettings, DownloadAttachment, PreviewAttachment, RemoveAttachment } from "./attachment.js";
import { EmbedAlignCenter, EmbedAlignLeft, EmbedAlignRight, EmbedProperties, EmbedSettings } from "./embed.js";
import { AddLink, AddInternalLink, EditLink, RemoveLink, LinkSettings, OpenLink, CopyLink } from "./link.js";
import { WebClipFullScreen, WebClipSettings, WebClipOpenExternal, WebClipOpenSource } from "./web-clip.js";
export type ToolId = keyof typeof tools;
declare const tools: {
    bold: typeof Bold;
    italic: typeof Italic;
    underline: typeof Underline;
    strikethrough: typeof Strikethrough;
    code: typeof Code;
    codeRemove: typeof CodeRemove;
    subscript: typeof Subscript;
    superscript: typeof Superscript;
    clearformatting: typeof ClearFormatting;
    addInternalLink: typeof AddInternalLink;
    addLink: typeof AddLink;
    editLink: typeof EditLink;
    removeLink: typeof RemoveLink;
    copyLink: typeof CopyLink;
    linkSettings: typeof LinkSettings;
    openLink: typeof OpenLink;
    insertBlock: typeof InsertBlock;
    numberedList: typeof NumberedList;
    bulletList: typeof BulletList;
    checkList: typeof CheckList;
    fontSize: typeof FontSize;
    fontFamily: typeof FontFamily;
    headings: typeof Headings;
    alignment: typeof Alignment;
    textDirection: typeof TextDirection;
    textColor: typeof TextColor;
    highlight: typeof Highlight;
    math: typeof Math;
    imageSettings: typeof ImageSettings;
    imageAlignCenter: typeof ImageAlignCenter;
    imageAlignLeft: typeof ImageAlignLeft;
    imageAlignRight: typeof ImageAlignRight;
    imageProperties: typeof ImageProperties;
    embedAlignCenter: typeof EmbedAlignCenter;
    embedAlignLeft: typeof EmbedAlignLeft;
    embedAlignRight: typeof EmbedAlignRight;
    embedProperties: typeof EmbedProperties;
    embedSettings: typeof EmbedSettings;
    webclipFullScreen: typeof WebClipFullScreen;
    webclipOpenExternal: typeof WebClipOpenExternal;
    webclipOpenSource: typeof WebClipOpenSource;
    webclipSettings: typeof WebClipSettings;
    previewAttachment: typeof PreviewAttachment;
    attachmentSettings: typeof AttachmentSettings;
    downloadAttachment: typeof DownloadAttachment;
    removeAttachment: typeof RemoveAttachment;
    tableSettings: typeof TableSettings;
    columnProperties: typeof ColumnProperties;
    rowProperties: typeof RowProperties;
    cellProperties: typeof CellProperties;
    insertColumnLeft: (props: ToolProps & {
        icon: import("../icons.js").IconNames;
    }) => import("react/jsx-runtime").JSX.Element;
    insertColumnRight: (props: ToolProps & {
        icon: import("../icons.js").IconNames;
    }) => import("react/jsx-runtime").JSX.Element;
    moveColumnLeft: (props: ToolProps & {
        icon: import("../icons.js").IconNames;
    }) => import("react/jsx-runtime").JSX.Element;
    moveColumnRight: (props: ToolProps & {
        icon: import("../icons.js").IconNames;
    }) => import("react/jsx-runtime").JSX.Element;
    deleteColumn: (props: ToolProps & {
        icon: import("../icons.js").IconNames;
    }) => import("react/jsx-runtime").JSX.Element;
    splitCells: (props: ToolProps & {
        icon: import("../icons.js").IconNames;
    }) => import("react/jsx-runtime").JSX.Element;
    mergeCells: (props: ToolProps & {
        icon: import("../icons.js").IconNames;
    }) => import("react/jsx-runtime").JSX.Element;
    cellBackgroundColor: typeof CellBackgroundColor;
    cellBorderColor: typeof CellBorderColor;
    cellTextColor: typeof CellTextColor;
    cellBorderWidth: typeof CellBorderWidth;
    insertRowAbove: (props: ToolProps & {
        icon: import("../icons.js").IconNames;
    }) => import("react/jsx-runtime").JSX.Element;
    insertRowBelow: (props: ToolProps & {
        icon: import("../icons.js").IconNames;
    }) => import("react/jsx-runtime").JSX.Element;
    moveRowUp: (props: ToolProps & {
        icon: import("../icons.js").IconNames;
    }) => import("react/jsx-runtime").JSX.Element;
    moveRowDown: (props: ToolProps & {
        icon: import("../icons.js").IconNames;
    }) => import("react/jsx-runtime").JSX.Element;
    deleteRow: (props: ToolProps & {
        icon: import("../icons.js").IconNames;
    }) => import("react/jsx-runtime").JSX.Element;
    deleteTable: (props: ToolProps & {
        icon: import("../icons.js").IconNames;
    }) => import("react/jsx-runtime").JSX.Element;
    exportToCSV: (props: ToolProps & {
        icon: import("../icons.js").IconNames;
    }) => import("react/jsx-runtime").JSX.Element;
    outdent: typeof Outdent;
    indent: typeof Indent;
    none: () => null;
};
export declare function findTool(id: ToolId): React.FunctionComponent<ToolProps>;
export {};
