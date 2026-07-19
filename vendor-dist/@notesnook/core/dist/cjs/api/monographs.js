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
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Monographs = void 0;
const http_js_1 = __importDefault(require("../utils/http.js"));
const constants_js_1 = __importDefault(require("../utils/constants.js"));
const types_js_1 = require("../types.js");
const index_js_1 = require("../database/index.js");
class Monographs {
    constructor(db) {
        this.db = db;
        this.monographs = [];
    }
    clear() {
        return __awaiter(this, void 0, void 0, function* () {
            this.monographs = [];
            yield this.db.monographsCollection.collection.clear();
        });
    }
    refresh() {
        return __awaiter(this, void 0, void 0, function* () {
            const ids = yield this.db.monographsCollection.all.ids();
            this.monographs = ids;
        });
    }
    /**
     * Check if note is published.
     */
    isPublished(noteId) {
        return this.monographs && this.monographs.indexOf(noteId) > -1;
    }
    /**
     * Get note published monograph id
     */
    monograph(noteId) {
        return this.monographs[this.monographs.indexOf(noteId)];
    }
    /**
     * Publish a note as a monograph
     */
    publish(noteId_1, title_1) {
        return __awaiter(this, arguments, void 0, function* (noteId, title, opts = {}) {
            if (title === "")
                throw new Error("Title cannot be empty.");
            if (!this.monographs.length)
                yield this.refresh();
            const update = !!this.isPublished(noteId);
            const user = yield this.db.user.getUser();
            const token = yield this.db.tokenManager.getAccessToken();
            if (!user || !token)
                throw new Error("Please login to publish a note.");
            const note = yield this.db.notes.note(noteId);
            if (!note)
                throw new Error("No such note found.");
            if (!note.contentId)
                throw new Error("Cannot publish an empty note.");
            const contentItem = yield this.db.content.get(note.contentId);
            if (!contentItem || (0, types_js_1.isDeleted)(contentItem))
                throw new Error("Could not find content for this note.");
            if (contentItem.locked)
                throw new Error("Cannot published locked notes.");
            const content = yield this.db.content.downloadMedia(`monograph-${noteId}`, contentItem, false);
            const monographPasswordsKey = yield this.db.user.getMonographPasswordsKey();
            const monograph = Object.assign({ id: noteId, title, userId: user.id, selfDestruct: opts.selfDestruct || false }, (opts.password
                ? {
                    password: monographPasswordsKey
                        ? yield this.db
                            .storage()
                            .encrypt(monographPasswordsKey, opts.password)
                        : undefined,
                    encryptedContent: yield this.db
                        .storage()
                        .encrypt({ password: opts.password }, JSON.stringify({ type: content.type, data: content.data }))
                }
                : {
                    password: undefined,
                    content: JSON.stringify({
                        type: content.type,
                        data: content.data
                    })
                }));
            const deviceId = yield this.db.kv().read("deviceId");
            const method = update ? http_js_1.default.patch.json : http_js_1.default.post.json;
            const url = update
                ? `${constants_js_1.default.API_HOST}/monographs?deviceId=${deviceId}`
                : `${constants_js_1.default.API_HOST}/monographs/v2?deviceId=${deviceId}`;
            const { id, datePublished, publishUrl } = yield method(url, monograph, token);
            this.monographs.push(id);
            yield this.db.monographsCollection.add({
                id,
                title: monograph.title,
                selfDestruct: monograph.selfDestruct,
                datePublished: datePublished,
                password: monograph.password,
                publishUrl: publishUrl
            });
            return id;
        });
    }
    /**
     * Unpublish a note
     */
    unpublish(noteId) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.monographs.length)
                yield this.refresh();
            const user = yield this.db.user.getUser();
            const token = yield this.db.tokenManager.getAccessToken();
            if (!user || !token)
                throw new Error("Please login to publish a note.");
            if (!this.isPublished(noteId))
                throw new Error("This note is not published.");
            const deviceId = yield this.db.kv().read("deviceId");
            yield http_js_1.default.delete(`${constants_js_1.default.API_HOST}/monographs/${noteId}?deviceId=${deviceId}`, token);
            this.monographs.splice(this.monographs.indexOf(noteId), 1);
            yield this.db.monographsCollection.collection.softDelete([noteId]);
        });
    }
    get all() {
        var _a;
        return this.db.notes.collection.createFilter((qb) => qb
            .where((0, index_js_1.isFalse)("dateDeleted"))
            .where((0, index_js_1.isFalse)("deleted"))
            .where("id", "in", this.monographs), (_a = this.db.options) === null || _a === void 0 ? void 0 : _a.batchSize);
    }
    get(monographId) {
        return this.db.monographsCollection.collection.get(monographId);
    }
    decryptPassword(password) {
        return __awaiter(this, void 0, void 0, function* () {
            const monographPasswordsKey = yield this.db.user.getMonographPasswordsKey();
            if (!monographPasswordsKey)
                return "";
            return this.db.storage().decrypt(monographPasswordsKey, password);
        });
    }
    metadata(monographId) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const token = yield this.db.tokenManager.getAccessToken();
                const info = (yield http_js_1.default.get(`${constants_js_1.default.API_HOST}/monographs/${monographId}/metadata`, token));
                return info;
            }
            catch (_a) {
                const monograph = yield this.get(monographId);
                return {
                    publishUrl: (monograph === null || monograph === void 0 ? void 0 : monograph.publishUrl) || "",
                    analytics: { totalViews: 0 }
                };
            }
        });
    }
}
exports.Monographs = Monographs;
