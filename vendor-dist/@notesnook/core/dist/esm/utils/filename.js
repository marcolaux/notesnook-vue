/*
This file is part of the Notesnook project (https://notesnook.com/)

Copyright (C) 2023 Streetwriters (Private) Limited

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
export function getFileNameWithExtension(filename, mime) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!mime || mime === "application/octet-stream")
            return filename;
        const { default: mimeDB } = yield import("mime-db");
        const { extensions } = mimeDB[mime] || {};
        if (!extensions || extensions.length === 0)
            return filename;
        for (const ext of extensions) {
            if (filename.endsWith(ext))
                return filename;
        }
        const extension = extensions.values().next().value;
        return `${filename}.${extension}`;
    });
}
export const PDFMimeType = "application/pdf";
export const DocumentMimeTypes = [
    PDFMimeType,
    "application/msword",
    "application/vnd.ms-word",
    "application/vnd.oasis.opendocument.text",
    "application/vnd.openxmlformats-officedocument.wordprocessingml",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml",
    "application/vnd.oasis.opendocument.spreadsheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml",
    "application/vnd.oasis.opendocument.presentation"
];
export function isDocument(mime) {
    return DocumentMimeTypes.some((a) => a.startsWith(mime));
}
export const WebClipMimeType = "application/vnd.notesnook.web-clip";
export function isWebClip(mime) {
    return mime === WebClipMimeType;
}
export function isImage(mime) {
    return mime.startsWith("image/");
}
export function isVideo(mime) {
    return mime.startsWith("video/");
}
export function isAudio(mime) {
    return mime.startsWith("audio/");
}
