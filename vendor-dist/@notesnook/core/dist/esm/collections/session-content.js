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
import { tinyToTiptap } from "../migrations.js";
import { makeSessionContentId } from "../utils/id.js";
import { isCipher } from "../utils/crypto.js";
import { isDeleted } from "../types.js";
import { SQLCollection } from "../database/sql-collection.js";
export class SessionContent {
    constructor(db) {
        this.db = db;
        this.name = "sessioncontent";
        this.collection = new SQLCollection(db.sql, db.transaction, "sessioncontent", db.eventManager, db.sanitizer);
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
            const sessionContentItemId = makeSessionContentId(sessionId);
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
            if (!session || isDeleted(session))
                return;
            const compressor = yield this.db.compressor();
            if (session.contentType === "tiny" &&
                session.compressed &&
                !session.locked &&
                !isCipher(session.data)) {
                session.data = yield compressor.compress(tinyToTiptap(yield compressor.decompress(session.data)));
                session.contentType = "tiptap";
                yield this.collection.upsert(session);
            }
            return {
                data: session.compressed && !isCipher(session.data)
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
