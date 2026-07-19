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
import hosts from "../utils/constants.js";
import { EVENTS } from "../common.js";
import { logger } from "../logger.js";
export class FileStorage {
    constructor(fs, tokenManager, eventManager) {
        this.fs = fs;
        this.tokenManager = tokenManager;
        this.eventManager = eventManager;
        this.id = Date.now();
        this.downloads = new Map();
        this.uploads = new Map();
        this.groups = {
            downloads: new Map(),
            uploads: new Map()
        };
    }
    queueDownloads(files, groupId, eventData) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const newFiles = yield this.fs.bulkExists(files.map((f) => f.filename));
                files = files.filter((f) => newFiles.includes(f.filename));
                if (files.length <= 0)
                    return;
                let current = 0;
                const token = yield this.tokenManager.getAccessToken();
                const total = files.length;
                if (this.groups.downloads.has(groupId)) {
                    logger.debug("[queueDownloads] group already exists", {
                        groupId
                    });
                    return this.groups.downloads.get(groupId);
                }
                const group = new Set();
                files.forEach((f) => group.add(f.filename));
                this.groups.downloads.set(groupId, group);
                for (const file of files) {
                    current++;
                    if (!group.has(file.filename)) {
                        this.eventManager.publish(EVENTS.fileDownloaded, {
                            success: false,
                            groupId,
                            filename: file.filename,
                            eventData,
                            current,
                            total
                        });
                        continue;
                    }
                    const download = this.downloads.get(file.filename);
                    if (download && download.operation) {
                        logger.debug("[queueDownloads] duplicate download", {
                            filename: file.filename,
                            groupId
                        });
                        yield download.operation;
                        continue;
                    }
                    const { filename, chunkSize } = file;
                    if (yield this.exists(filename)) {
                        this.eventManager.publish(EVENTS.fileDownloaded, {
                            success: true,
                            groupId,
                            filename,
                            eventData,
                            current,
                            total
                        });
                        continue;
                    }
                    this.eventManager.publish(EVENTS.fileDownload, {
                        total,
                        current,
                        groupId,
                        filename
                    });
                    const url = `${hosts.API_HOST}/s3?name=${filename}`;
                    const { execute, cancel } = this.fs.downloadFile(filename, {
                        url,
                        chunkSize,
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    file.cancel = cancel;
                    file.operation = execute()
                        .catch(() => false)
                        .finally(() => {
                        this.downloads.delete(filename);
                        group.delete(filename);
                    });
                    this.downloads.set(filename, file);
                    const result = yield file.operation;
                    if (eventData)
                        this.eventManager.publish(EVENTS.fileDownloaded, {
                            success: result,
                            total,
                            current,
                            groupId,
                            filename,
                            eventData
                        });
                }
            }
            finally {
                this.groups.downloads.delete(groupId);
            }
        });
    }
    queueUploads(files, groupId) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                let current = 0;
                const token = yield this.tokenManager.getAccessToken();
                const total = files.length;
                if (this.groups.uploads.has(groupId)) {
                    logger.debug("[queueUploads] group already exists", {
                        groupId
                    });
                    return this.groups.uploads.get(groupId);
                }
                const group = new Set();
                files.forEach((f) => group.add(f.filename));
                this.groups.uploads.set(groupId, group);
                for (const file of files) {
                    if (!group.has(file.filename))
                        continue;
                    const upload = this.uploads.get(file.filename);
                    if (upload && upload.operation) {
                        logger.debug("[queueUploads] duplicate upload", {
                            filename: file.filename,
                            groupId
                        });
                        yield file.operation;
                        continue;
                    }
                    const { filename, chunkSize } = file;
                    let error = null;
                    const url = `${hosts.API_HOST}/s3?name=${filename}`;
                    const { execute, cancel } = this.fs.uploadFile(filename, {
                        chunkSize,
                        url,
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    file.cancel = cancel;
                    file.operation = execute()
                        .catch((e) => {
                        logger.error(e, "failed to upload attachment", { hash: filename });
                        error = e;
                        return false;
                    })
                        .finally(() => {
                        this.uploads.delete(filename);
                        group.delete(filename);
                    });
                    this.eventManager.publish(EVENTS.fileUpload, {
                        total,
                        current,
                        groupId,
                        filename
                    });
                    this.uploads.set(filename, file);
                    const result = yield file.operation;
                    this.eventManager.publish(EVENTS.fileUploaded, {
                        error,
                        success: result,
                        total,
                        current: ++current,
                        groupId,
                        filename
                    });
                }
            }
            finally {
                this.groups.uploads.delete(groupId);
            }
        });
    }
    downloadFile(groupId, filename, chunkSize) {
        return __awaiter(this, void 0, void 0, function* () {
            if (yield this.exists(filename))
                return true;
            const download = this.downloads.get(filename);
            if (download && download.operation) {
                logger.debug("[downloadFile] duplicate download", { filename, groupId });
                return yield download.operation;
            }
            logger.debug("[downloadFile] downloading", { filename, groupId });
            const url = `${hosts.API_HOST}/s3?name=${filename}`;
            const file = { filename, chunkSize };
            const token = yield this.tokenManager.getAccessToken();
            const group = this.groups.downloads.get(groupId) || new Set();
            const { execute, cancel } = this.fs.downloadFile(filename, {
                url,
                chunkSize,
                headers: { Authorization: `Bearer ${token}` }
            });
            file.cancel = cancel;
            file.operation = execute().finally(() => {
                this.downloads.delete(filename);
                group.delete(filename);
            });
            this.downloads.set(filename, file);
            this.groups.downloads.set(groupId, group.add(filename));
            return yield file.operation;
        });
    }
    cancel(groupId) {
        return __awaiter(this, void 0, void 0, function* () {
            const queues = [
                {
                    type: "download",
                    ids: this.groups.downloads.get(groupId),
                    files: this.downloads
                },
                {
                    type: "upload",
                    ids: this.groups.uploads.get(groupId),
                    files: this.uploads
                }
            ].filter((a) => !!a.ids);
            for (const queue of queues) {
                if (!queue.ids)
                    continue;
                for (const filename of queue.ids) {
                    const file = queue.files.get(filename);
                    if (file === null || file === void 0 ? void 0 : file.cancel)
                        yield file.cancel("Operation canceled.");
                    queue.ids.delete(filename);
                }
                if (queue.type === "download") {
                    this.groups.downloads.delete(groupId);
                    this.eventManager.publish(EVENTS.downloadCanceled, {
                        groupId,
                        canceled: true
                    });
                }
                else if (queue.type === "upload") {
                    this.groups.uploads.delete(groupId);
                    this.eventManager.publish(EVENTS.uploadCanceled, {
                        groupId,
                        canceled: true
                    });
                }
            }
        });
    }
    readEncrypted(filename, encryptionKey, cipherData) {
        return this.fs.readEncrypted(filename, encryptionKey, cipherData);
    }
    writeEncryptedBase64(data, encryptionKey, mimeType) {
        return this.fs.writeEncryptedBase64(data, encryptionKey, mimeType);
    }
    deleteFile(filename_1) {
        return __awaiter(this, arguments, void 0, function* (filename, localOnly = false) {
            if (localOnly)
                return yield this.fs.deleteFile(filename);
            const token = yield this.tokenManager.getAccessToken();
            const url = `${hosts.API_HOST}/s3?name=${filename}`;
            return yield this.fs.deleteFile(filename, {
                url,
                headers: { Authorization: `Bearer ${token}` },
                chunkSize: 0
            });
        });
    }
    bulkDeleteFiles(filenames_1) {
        return __awaiter(this, arguments, void 0, function* (filenames, localOnly = false) {
            if (filenames.length === 0)
                return true;
            if (localOnly)
                return yield this.fs.bulkDeleteFiles(filenames);
            const token = yield this.tokenManager.getAccessToken();
            const url = `${hosts.API_HOST}/s3/bulk-delete`;
            return yield this.fs.bulkDeleteFiles(filenames, {
                url,
                headers: { Authorization: `Bearer ${token}` },
                chunkSize: 0
            });
        });
    }
    exists(filename) {
        return this.fs.exists(filename);
    }
    clear() {
        return this.fs.clearFileStorage();
    }
    hashBase64(data) {
        return this.fs.hashBase64(data);
    }
    getUploadedFileSize(filename) {
        return this.fs.getUploadedFileSize(filename);
    }
}
