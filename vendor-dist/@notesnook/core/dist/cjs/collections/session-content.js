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
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionContent = void 0;
const migrations_js_1 = require("../migrations.js");
const id_js_1 = require("../utils/id.js");
const crypto_js_1 = require("../utils/crypto.js");
const types_js_1 = require("../types.js");
const sql_collection_js_1 = require("../database/sql-collection.js");
class SessionContent {
    constructor(db) {
        this.db = db;
        this.name = "sessioncontent";
        this.collection = new sql_collection_js_1.SQLCollection(db.sql, db.transaction, "sessioncontent", db.eventManager, db.sanitizer);
    }
    init() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.collection.init();
        });
    }
    add(sessionId, content, locked) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!sessionId || !content)
                return;
            // const data =
            //   locked || isCipher(content.data)
            //     ? content.data
            //     :  await this.db.compressor().compress(content.data);
            const sessionContentItemId = (0, id_js_1.makeSessionContentId)(sessionId);
            const sessionContentExists = yield this.collection.exists(sessionContentItemId);
            const sessionItem = {
                type: "sessioncontent",
                id: sessionContentItemId,
                compressed: false,
                localOnly: true,
                locked: locked || false,
                dateCreated: Date.now(),
                dateModified: Date.now()
            };
            if (content.data && content.type) {
                sessionItem.data = content.data;
                sessionItem.contentType = content.type;
                if (typeof content.title !== "string" && !sessionContentExists) {
                    const note = yield this.db.notes.note(content.noteId);
                    sessionItem.title = note === null || note === void 0 ? void 0 : note.title;
                }
            }
            if (content.title) {
                sessionItem.title = content.title;
                if (!content.data && !content.type && !sessionContentExists) {
                    const note = yield this.db.notes.note(content.noteId);
                    if (note === null || note === void 0 ? void 0 : note.contentId) {
                        const noteContent = yield this.db.content.get(note === null || note === void 0 ? void 0 : note.contentId);
                        if (noteContent) {
                            sessionItem.data = noteContent === null || noteContent === void 0 ? void 0 : noteContent.data;
                            sessionItem.contentType = noteContent === null || noteContent === void 0 ? void 0 : noteContent.type;
                        }
                    }
                }
            }
            if (sessionContentExists) {
                this.collection.update([sessionContentItemId], sessionItem);
            }
            else {
                yield this.collection.upsert(sessionItem);
            }
        });
    }
    get(sessionContentId) {
        return __awaiter(this, void 0, void 0, function* () {
            const session = yield this.collection.get(sessionContentId);
            if (!session || (0, types_js_1.isDeleted)(session))
                return;
            const compressor = yield this.db.compressor();
            if (session.contentType === "tiny" &&
                session.compressed &&
                !session.locked &&
                !(0, crypto_js_1.isCipher)(session.data)) {
                session.data = yield compressor.compress((0, migrations_js_1.tinyToTiptap)(yield compressor.decompress(session.data)));
                session.contentType = "tiptap";
                yield this.collection.upsert(session);
            }
            return {
                data: session.compressed && !(0, crypto_js_1.isCipher)(session.data)
                    ? yield compressor.decompress(session.data)
                    : session.data,
                type: session.contentType,
                title: session.title
            };
        });
    }
    remove(sessionContentId) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.collection.delete([sessionContentId]);
        });
    }
}
exports.SessionContent = SessionContent;
