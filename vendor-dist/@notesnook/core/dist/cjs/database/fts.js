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
exports.rebuildSearchIndex = rebuildSearchIndex;
const kysely_1 = require("@streetwriters/kysely");
function rebuildSearchIndex(db) {
    return __awaiter(this, void 0, void 0, function* () {
        yield db.transaction().execute((tx) => __awaiter(this, void 0, void 0, function* () {
            for (const query of [
                (0, kysely_1.sql) `INSERT INTO content_fts(content_fts) VALUES('delete-all')`,
                (0, kysely_1.sql) `INSERT INTO notes_fts(notes_fts) VALUES('delete-all')`
            ]) {
                yield query.execute(tx);
            }
            yield tx
                .insertInto("content_fts")
                .columns(["rowid", "id", "data", "noteId"])
                .expression((eb) => eb
                .selectFrom("content")
                .where((eb) => eb.and([
                eb("noteId", "is not", null),
                eb("data", "is not", null),
                eb("deleted", "is not", true)
            ]))
                .select([
                "rowid",
                "id",
                (0, kysely_1.sql) `IIF(locked == 1, '', data)`.as("data"),
                "noteId"
            ]))
                .execute();
            yield tx
                .insertInto("notes_fts")
                .columns(["rowid", "id", "title"])
                .expression((eb) => eb
                .selectFrom("notes")
                .where((eb) => eb.and([eb("title", "is not", null), eb("deleted", "is not", true)]))
                .select(["rowid", "id", "title"]))
                .execute();
            for (const query of [
                (0, kysely_1.sql) `INSERT INTO content_fts(content_fts) VALUES('optimize')`,
                (0, kysely_1.sql) `INSERT INTO notes_fts(notes_fts) VALUES('optimize')`
            ]) {
                yield query.execute(tx);
            }
        }));
    });
}
