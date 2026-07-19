"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebClipMimeType = exports.DocumentMimeTypes = exports.PDFMimeType = void 0;
exports.getFileNameWithExtension = getFileNameWithExtension;
exports.isDocument = isDocument;
exports.isWebClip = isWebClip;
exports.isImage = isImage;
exports.isVideo = isVideo;
exports.isAudio = isAudio;
function getFileNameWithExtension(filename, mime) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!mime || mime === "application/octet-stream")
            return filename;
        const { default: mimeDB } = yield Promise.resolve().then(() => __importStar(require("mime-db")));
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
exports.PDFMimeType = "application/pdf";
exports.DocumentMimeTypes = [
    exports.PDFMimeType,
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
function isDocument(mime) {
    return exports.DocumentMimeTypes.some((a) => a.startsWith(mime));
}
exports.WebClipMimeType = "application/vnd.notesnook.web-clip";
function isWebClip(mime) {
    return mime === exports.WebClipMimeType;
}
function isImage(mime) {
    return mime.startsWith("image/");
}
function isVideo(mime) {
    return mime.startsWith("video/");
}
function isAudio(mime) {
    return mime.startsWith("audio/");
}
