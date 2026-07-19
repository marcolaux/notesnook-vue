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
import { isCipher } from "../utils/crypto.js";
import { FilteredSelector, SQLCollection } from "../database/sql-collection.js";
import { isDeleted } from "../types.js";
import { makeSessionContentId } from "../utils/id.js";
import { SessionContent } from "./session-content.js";
export class NoteHistory {
    constructor(db) {
        this.db = db;
        this.name = "notehistory";
        this.sessionContent = new SessionContent(db);
        this.collection = new SQLCollection(db.sql, db.transaction, "notehistory", db.eventManager, db.sanitizer);
    }
    init() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.collection.init();
            yield this.sessionContent.init();
        });
    }
    // async get(noteId: string, order: "asc" | "desc" = "desc") {
    //   if (!noteId) return [];
    //   // const indices = this.collection.indexer.indices;
    //   // const sessionIds = indices.filter((id) => id.startsWith(noteId));
    //   // if (sessionIds.length === 0) return [];
    //   // const history = await this.getSessions(sessionIds);
    //   // return history.sort(function (a, b) {
    //   //   return b.dateModified - a.dateModified;
    //   // });
    // const history = await this.db
    //   .sql()
    //   .selectFrom("notehistory")
    //   .where("noteId", "==", noteId)
    //     .orderBy(`dateModified ${order}`)
    //     .selectAll()
    //     .execute();
    //   return history as HistorySession[];
    // }
    get(noteId) {
        return new FilteredSelector("notehistory", this.db.sql().selectFrom("notehistory").where("noteId", "==", noteId));
    }
    add(sessionId, content) {
        return __awaiter(this, void 0, void 0, function* () {
            const { noteId, locked } = content;
            sessionId = `${noteId}_${sessionId}`;
            if (yield this.collection.exists(sessionId)) {
                yield this.collection.update([sessionId], {
                    locked
                });
            }
            else {
                yield this.collection.upsert({
                    type: "session",
                    id: sessionId,
                    sessionContentId: makeSessionContentId(sessionId),
                    noteId,
                    dateCreated: Date.now(),
                    dateModified: Date.now(),
                    localOnly: true,
                    locked
                });
            }
            yield this.sessionContent.add(sessionId, content, locked);
            yield this.cleanup(noteId);
            return sessionId;
        });
    }
    cleanup(noteId, limit) {
        return __awaiter(this, void 0, void 0, function* () {
            limit = limit || (yield this.db.options.maxNoteVersions());
            if (!limit)
                return;
            const history = yield this.db
                .sql()
                .selectFrom("notehistory")
                .where("noteId", "==", noteId)
                .orderBy(`dateModified desc`)
                .select(["id", "sessionContentId"])
                .offset(limit)
                .limit(10)
                .$narrowType()
                .execute();
            for (const session of history) {
                yield this._remove(session);
            }
            // const history = await this.get(noteId, "asc");
            // if (history.length === 0 || history.length < limit) return;
            // const deleteCount = history.length - limit;
            // for (let i = 0; i < deleteCount; i++) {
            //   const session = history[i];
            //   await this._remove(session);
            // }
        });
    }
    content(sessionId) {
        return __awaiter(this, void 0, void 0, function* () {
            const session = yield this.collection.get(sessionId);
            if (!session || isDeleted(session))
                return;
            return yield this.sessionContent.get(session.sessionContentId);
        });
    }
    session(sessionId) {
        return __awaiter(this, void 0, void 0, function* () {
            const session = yield this.collection.get(sessionId);
            if (!session || isDeleted(session))
                return;
            return session;
        });
    }
    remove(sessionId) {
        return __awaiter(this, void 0, void 0, function* () {
            const session = yield this.collection.get(sessionId);
            if (!session || isDeleted(session))
                return;
            yield this._remove(session);
        });
    }
    clearSessions(...noteIds) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.db.transaction(() => __awaiter(this, void 0, void 0, function* () {
                const deletedIds = yield this.db
                    .sql()
                    .deleteFrom("notehistory")
                    .where("noteId", "in", noteIds)
                    .returning("sessionContentId as sessionContentId")
                    .execute();
                yield this.db
                    .sql()
                    .deleteFrom("sessioncontent")
                    .where("id", "in", deletedIds.reduce((arr, item) => {
                    if (item.sessionContentId && !arr.includes(item.sessionContentId))
                        arr.push(item.sessionContentId);
                    return arr;
                }, []))
                    .execute();
            }));
        });
    }
    _remove(session) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.collection.delete([session.id]);
            yield this.sessionContent.remove(session.sessionContentId);
        });
    }
    restore(sessionId) {
        return __awaiter(this, void 0, void 0, function* () {
            const session = yield this.collection.get(sessionId);
            if (!session || isDeleted(session))
                return;
            const content = yield this.sessionContent.get(session.sessionContentId);
            const note = yield this.db.notes.note(session.noteId);
            if (!note || !content)
                return;
            if (session.locked && isCipher(content.data)) {
                const sessionId = `${Date.now()}`;
                yield this.db.content.add({
                    id: note.contentId,
                    noteId: session.noteId,
                    sessionId: sessionId,
                    data: content.data,
                    type: content.type
                });
                if (content.title) {
                    yield this.db.notes.add({
                        id: session.noteId,
                        sessionId: sessionId,
                        title: content.title
                    });
                }
            }
            else {
                const note = {
                    id: session.noteId,
                    sessionId: `${Date.now()}`
                };
                note.content =
                    content.data && content.type && !isCipher(content.data)
                        ? {
                            data: content.data,
                            type: content.type
                        }
                        : { data: "<p></p>", type: "tiptap" };
                if (content.title) {
                    note.title = content.title;
                }
                yield this.db.notes.add(note);
            }
        });
    }
}
