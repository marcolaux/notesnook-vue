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
exports.NNMigrationProvider = void 0;
const kysely_1 = require("@streetwriters/kysely");
const fts_js_1 = require("./fts.js");
const COLLATE_NOCASE = (col) => col.modifyEnd((0, kysely_1.sql) `collate nocase`);
class NNMigrationProvider {
    getMigrations() {
        return __awaiter(this, void 0, void 0, function* () {
            return {
                "1": {
                    up(db) {
                        return __awaiter(this, void 0, void 0, function* () {
                            yield db.schema
                                .createTable("kv")
                                .ifNotExists()
                                .modifyEnd((0, kysely_1.sql) `without rowid`)
                                .addColumn("key", "text", (c) => c.primaryKey().unique().notNull())
                                .addColumn("value", "text")
                                .addColumn("dateModified", "integer")
                                .execute();
                            yield db.schema
                                .createTable("notes")
                                .ifNotExists()
                                // .modifyEnd(sql`without rowid`)
                                .$call(addBaseColumns)
                                .$call(addTrashColumns)
                                .addColumn("title", "text", COLLATE_NOCASE)
                                .addColumn("headline", "text")
                                .addColumn("contentId", "text")
                                .addColumn("pinned", "boolean")
                                .addColumn("favorite", "boolean")
                                .addColumn("localOnly", "boolean")
                                .addColumn("conflicted", "boolean")
                                .addColumn("readonly", "boolean")
                                .addColumn("dateEdited", "integer")
                                .execute();
                            yield createFTS5Table("notes_fts", [{ name: "id" }, { name: "title" }], { contentTable: "notes", tokenizer: ["porter", "trigram"] }).execute(db);
                            yield db.schema
                                .createTable("content")
                                .ifNotExists()
                                // .modifyEnd(sql`without rowid`)
                                .$call(addBaseColumns)
                                .addColumn("noteId", "text")
                                .addColumn("data", "text")
                                .addColumn("locked", "boolean")
                                .addColumn("localOnly", "boolean")
                                .addColumn("conflicted", "text")
                                .addColumn("sessionId", "text")
                                .addColumn("dateEdited", "integer")
                                .addColumn("dateResolved", "integer")
                                .execute();
                            yield createFTS5Table("content_fts", [{ name: "id" }, { name: "noteId" }, { name: "data" }], { contentTable: "content", tokenizer: ["porter", "trigram"] }).execute(db);
                            yield db.schema
                                .createTable("notehistory")
                                .ifNotExists()
                                .modifyEnd((0, kysely_1.sql) `without rowid`)
                                .$call(addBaseColumns)
                                .addColumn("noteId", "text")
                                .addColumn("sessionContentId", "text")
                                .addColumn("localOnly", "boolean")
                                .addColumn("locked", "boolean")
                                .execute();
                            yield db.schema
                                .createTable("sessioncontent")
                                .ifNotExists()
                                .modifyEnd((0, kysely_1.sql) `without rowid`)
                                .$call(addBaseColumns)
                                .addColumn("data", "text")
                                .addColumn("contentType", "text")
                                .addColumn("locked", "boolean")
                                .addColumn("compressed", "boolean")
                                .addColumn("localOnly", "boolean")
                                .execute();
                            yield db.schema
                                .createTable("notebooks")
                                .ifNotExists()
                                .modifyEnd((0, kysely_1.sql) `without rowid`)
                                .$call(addBaseColumns)
                                .$call(addTrashColumns)
                                .addColumn("title", "text", COLLATE_NOCASE)
                                .addColumn("description", "text")
                                .addColumn("dateEdited", "integer")
                                .addColumn("pinned", "boolean")
                                .execute();
                            yield db.schema
                                .createTable("tags")
                                .ifNotExists()
                                .modifyEnd((0, kysely_1.sql) `without rowid`)
                                .$call(addBaseColumns)
                                .addColumn("title", "text", COLLATE_NOCASE)
                                .execute();
                            yield db.schema
                                .createTable("colors")
                                .ifNotExists()
                                .modifyEnd((0, kysely_1.sql) `without rowid`)
                                .$call(addBaseColumns)
                                .addColumn("title", "text", COLLATE_NOCASE)
                                .addColumn("colorCode", "text", (c) => c.unique())
                                .execute();
                            yield db.schema
                                .createTable("vaults")
                                .ifNotExists()
                                .modifyEnd((0, kysely_1.sql) `without rowid`)
                                .$call(addBaseColumns)
                                .addColumn("title", "text", COLLATE_NOCASE)
                                .addColumn("key", "text")
                                .execute();
                            yield db.schema
                                .createTable("relations")
                                .ifNotExists()
                                .modifyEnd((0, kysely_1.sql) `without rowid`)
                                .$call(addBaseColumns)
                                .addColumn("fromType", "text")
                                .addColumn("fromId", "text")
                                .addColumn("toType", "text")
                                .addColumn("toId", "text")
                                .execute();
                            yield db.schema
                                .createTable("shortcuts")
                                .ifNotExists()
                                .modifyEnd((0, kysely_1.sql) `without rowid`)
                                .$call(addBaseColumns)
                                .addColumn("sortIndex", "integer")
                                .addColumn("itemId", "text")
                                .addColumn("itemType", "text")
                                .execute();
                            yield db.schema
                                .createTable("reminders")
                                .ifNotExists()
                                .modifyEnd((0, kysely_1.sql) `without rowid`)
                                .$call(addBaseColumns)
                                .addColumn("title", "text", COLLATE_NOCASE)
                                .addColumn("description", "text")
                                .addColumn("priority", "text")
                                .addColumn("date", "integer")
                                .addColumn("mode", "text")
                                .addColumn("recurringMode", "text")
                                .addColumn("selectedDays", "text")
                                .addColumn("localOnly", "boolean")
                                .addColumn("disabled", "boolean")
                                .addColumn("snoozeUntil", "integer")
                                .execute();
                            yield db.schema
                                .createTable("attachments")
                                .ifNotExists()
                                .modifyEnd((0, kysely_1.sql) `without rowid`)
                                .$call(addBaseColumns)
                                .addColumn("iv", "text")
                                .addColumn("salt", "text")
                                .addColumn("size", "integer")
                                .addColumn("alg", "text")
                                .addColumn("key", "text")
                                .addColumn("chunkSize", "integer")
                                .addColumn("hash", "text", (c) => c.unique())
                                .addColumn("hashType", "text")
                                .addColumn("mimeType", "text")
                                .addColumn("filename", "text")
                                .addColumn("dateDeleted", "integer")
                                .addColumn("dateUploaded", "integer")
                                .addColumn("failed", "text")
                                .execute();
                            yield db.schema
                                .createTable("settings")
                                .ifNotExists()
                                .modifyEnd((0, kysely_1.sql) `without rowid`)
                                .$call(addBaseColumns)
                                .addColumn("key", "text", (c) => c.unique())
                                .addColumn("value", "text")
                                .execute();
                            yield db.schema
                                .createIndex("notehistory_noteid")
                                .ifNotExists()
                                .on("notehistory")
                                .column("noteId")
                                .execute();
                            yield db.schema
                                .createIndex("relation_from_general")
                                .ifNotExists()
                                .on("relations")
                                .columns(["fromType", "toType", "fromId"])
                                .where("toType", "!=", "note")
                                .where("toType", "!=", "notebook")
                                .execute();
                            yield db.schema
                                .createIndex("relation_to_general")
                                .ifNotExists()
                                .on("relations")
                                .columns(["fromType", "toType", "toId"])
                                .where("fromType", "!=", "note")
                                .where("fromType", "!=", "notebook")
                                .execute();
                            yield db.schema
                                .createIndex("relation_from_note_notebook")
                                .ifNotExists()
                                .on("relations")
                                .columns(["fromType", "toType", "fromId", "toId"])
                                .where((eb) => eb.or([
                                eb("toType", "==", "note"),
                                eb("toType", "==", "notebook")
                            ]))
                                .execute();
                            yield db.schema
                                .createIndex("relation_to_note_notebook")
                                .ifNotExists()
                                .on("relations")
                                .columns(["fromType", "toType", "toId", "fromId"])
                                .where((eb) => eb.or([
                                eb("fromType", "==", "note"),
                                eb("fromType", "==", "notebook")
                            ]))
                                .execute();
                            yield db.schema
                                .createIndex("note_type")
                                .ifNotExists()
                                .on("notes")
                                .columns(["type"])
                                .execute();
                            yield db.schema
                                .createIndex("note_deleted")
                                .ifNotExists()
                                .on("notes")
                                .columns(["deleted"])
                                .execute();
                            yield db.schema
                                .createIndex("note_date_deleted")
                                .ifNotExists()
                                .on("notes")
                                .columns(["dateDeleted"])
                                .execute();
                            yield db.schema
                                .createIndex("notebook_type")
                                .ifNotExists()
                                .on("notebooks")
                                .columns(["type"])
                                .execute();
                            yield db.schema
                                .createIndex("attachment_hash")
                                .ifNotExists()
                                .on("attachments")
                                .column("hash")
                                .execute();
                            yield db.schema
                                .createIndex("content_noteId")
                                .ifNotExists()
                                .on("content")
                                .columns(["noteId"])
                                .execute();
                        });
                    },
                    down(db) {
                        return __awaiter(this, void 0, void 0, function* () { });
                    }
                },
                "2": {
                    up(db) {
                        return __awaiter(this, void 0, void 0, function* () {
                            yield (0, fts_js_1.rebuildSearchIndex)(db);
                        });
                    }
                },
                "3": {
                    up(db) {
                        return __awaiter(this, void 0, void 0, function* () {
                            yield db
                                .updateTable("notes")
                                .where("id", "in", (eb) => eb
                                .selectFrom("content")
                                .select("noteId as id")
                                .where((eb) => eb.or([
                                eb("conflicted", "is", null),
                                eb("conflicted", "==", false)
                            ]))
                                .$castTo())
                                .set({ conflicted: false })
                                .execute();
                        });
                    }
                },
                "4": {
                    up(db) {
                        return __awaiter(this, void 0, void 0, function* () {
                            yield db.schema
                                .createTable("config")
                                .ifNotExists()
                                .modifyEnd((0, kysely_1.sql) `without rowid`)
                                .addColumn("name", "text", (c) => c.primaryKey().unique().notNull())
                                .addColumn("value", "text")
                                .addColumn("dateModified", "integer")
                                .execute();
                        });
                    }
                },
                "5": {
                    up(db) {
                        return __awaiter(this, void 0, void 0, function* () {
                            yield db
                                .deleteFrom("relations")
                                .where((eb) => eb.or([eb("fromId", "is", null), eb("toId", "is", null)]))
                                .execute();
                        });
                    }
                },
                "6": {
                    up(db) {
                        return __awaiter(this, void 0, void 0, function* () {
                            // await db.transaction().execute(async (tx) => {
                            //   await tx.schema.dropTable("content_fts").execute();
                            //   await tx.schema.dropTable("notes_fts").execute();
                            //   await createFTS5Table(
                            //     "notes_fts",
                            //     [{ name: "id" }, { name: "title" }],
                            //     {
                            //       contentTable: "notes",
                            //       tokenizer: ["porter", "trigram", "remove_diacritics 1"]
                            //     }
                            //   ).execute(tx);
                            //   await createFTS5Table(
                            //     "content_fts",
                            //     [{ name: "id" }, { name: "noteId" }, { name: "data" }],
                            //     {
                            //       contentTable: "content",
                            //       tokenizer: ["porter", "trigram", "remove_diacritics 1"]
                            //     }
                            //   ).execute(tx);
                            // });
                            // await rebuildSearchIndex(db);
                        });
                    }
                },
                "7": {
                    up() {
                        return __awaiter(this, void 0, void 0, function* () { });
                    }
                },
                "8": {
                    up(db) {
                        return __awaiter(this, void 0, void 0, function* () {
                            yield ensureColumn(db, "notes", "isGeneratedTitle", () => __awaiter(this, void 0, void 0, function* () {
                                yield db.schema
                                    .alterTable("notes")
                                    .addColumn("isGeneratedTitle", "boolean")
                                    .execute();
                            }));
                        });
                    }
                },
                "9": {
                    up(db) {
                        return __awaiter(this, void 0, void 0, function* () {
                            yield ensureColumn(db, "notes", "archived", () => __awaiter(this, void 0, void 0, function* () {
                                yield db.schema
                                    .alterTable("notes")
                                    .addColumn("archived", "boolean")
                                    .execute();
                            }));
                        });
                    }
                },
                // changing the migrations name scheme from here because
                // apparently, Kysley runs migrations in alphanumeric order.
                // To ensure things keep running smoothly, we are now moving
                // to a date-based migration name but since any number is smaller
                // than 9, we have to use "a" in the beginning.
                "a-2025-05-16": {
                    up() {
                        return __awaiter(this, void 0, void 0, function* () { });
                    }
                },
                "a-2025-05-17": {
                    up() {
                        return __awaiter(this, void 0, void 0, function* () { });
                    }
                },
                "a-2025-06-04": {
                    up(db) {
                        return __awaiter(this, void 0, void 0, function* () {
                            yield runFTSTablesMigrations(db);
                        });
                    }
                },
                "a-2025-07-30": {
                    up(db) {
                        return __awaiter(this, void 0, void 0, function* () {
                            yield db.schema
                                .createTable("monographs")
                                .ifNotExists()
                                .$call(addBaseColumns)
                                .addColumn("datePublished", "integer")
                                .addColumn("title", "text", COLLATE_NOCASE)
                                .addColumn("selfDestruct", "boolean")
                                .addColumn("password", "text")
                                .execute();
                        });
                    }
                },
                "a-2026-01-07": {
                    up(db) {
                        return __awaiter(this, void 0, void 0, function* () {
                            yield ensureColumn(db, "notes", "expiryDate", () => __awaiter(this, void 0, void 0, function* () {
                                yield db.schema
                                    .alterTable("notes")
                                    .addColumn("expiryDate", "text")
                                    .execute();
                            }));
                            yield db.schema
                                .createIndex("note_expiry_date")
                                .ifNotExists()
                                .on("notes")
                                .expression((0, kysely_1.sql) `expiryDate ->> '$.value'`)
                                .execute();
                        });
                    }
                },
                "a-2026-01-09": {
                    up(db) {
                        return __awaiter(this, void 0, void 0, function* () {
                            yield ensureColumn(db, "sessioncontent", "title", () => __awaiter(this, void 0, void 0, function* () {
                                yield db.schema
                                    .alterTable("sessioncontent")
                                    .addColumn("title", "text")
                                    .execute();
                            }));
                        });
                    }
                },
                "a-2026-02-11": {
                    up(db) {
                        return __awaiter(this, void 0, void 0, function* () {
                            yield ensureColumn(db, "monographs", "publishUrl", () => __awaiter(this, void 0, void 0, function* () {
                                yield db.schema
                                    .alterTable("monographs")
                                    .addColumn("publishUrl", "text", COLLATE_NOCASE)
                                    .execute();
                            }));
                        });
                    }
                },
                "a-2026-04-06": {
                    up(db) {
                        return __awaiter(this, void 0, void 0, function* () {
                            yield ensureColumn(db, "notes", "spellcheck", () => __awaiter(this, void 0, void 0, function* () {
                                yield db.schema
                                    .alterTable("notes")
                                    .addColumn("spellcheck", "boolean", (c) => c.defaultTo(true))
                                    .execute();
                            }));
                        });
                    }
                },
                "a-2026-05-07": {
                    up(db) {
                        return __awaiter(this, void 0, void 0, function* () {
                            yield db.schema
                                .createTable("inboxitemshistory")
                                .ifNotExists()
                                .modifyEnd((0, kysely_1.sql) `without rowid`)
                                .$call(addBaseColumns)
                                .addColumn("dateSynced", "integer")
                                .addColumn("status", "text")
                                .addColumn("source", "text")
                                .addColumn("errorContext", "text")
                                .execute();
                        });
                    }
                }
            };
        });
    }
}
exports.NNMigrationProvider = NNMigrationProvider;
const addBaseColumns = (builder) => {
    return builder
        .addColumn("id", "text", (c) => c.primaryKey().unique().notNull())
        .addColumn("type", "text")
        .addColumn("dateModified", "integer")
        .addColumn("dateCreated", "integer")
        .addColumn("synced", "boolean")
        .addColumn("deleted", "boolean");
};
const addTrashColumns = (builder) => {
    return builder
        .addColumn("dateDeleted", "integer")
        .addColumn("itemType", "text")
        .addColumn("deletedBy", "text");
};
function createFTS5Table(name, columns, options = {}) {
    const _options = [];
    if (options.contentTable)
        _options.push(`content='${options.contentTable}'`);
    if (options.contentTableRowId)
        _options.push(`content_rowid='${options.contentTableRowId}'`);
    if (options.tokenizer)
        _options.push(`tokenize='${options.tokenizer.join(" ")}'`);
    if (options.prefix)
        _options.push(`prefix='${options.prefix.join(" ")}'`);
    if (options.columnSize)
        _options.push(`columnsize='${options.columnSize}'`);
    if (options.detail)
        _options.push(`detail='${options.detail}'`);
    const args = kysely_1.sql.join([
        kysely_1.sql.join(columns.map((c) => kysely_1.sql.ref(`${c.name}${c.unindexed ? " UNINDEXED" : ""}`))),
        kysely_1.sql.join(_options.map((o) => kysely_1.sql.raw(o)))
    ]);
    return (0, kysely_1.sql) `CREATE VIRTUAL TABLE IF NOT EXISTS ${kysely_1.sql.raw(name)} USING fts5(${args})`;
}
function runFTSTablesMigrations(db) {
    return __awaiter(this, void 0, void 0, function* () {
        yield db.transaction().execute((tx) => __awaiter(this, void 0, void 0, function* () {
            yield tx.schema.dropTable("content_fts").execute();
            yield tx.schema.dropTable("notes_fts").execute();
            yield createFTS5Table("notes_fts", [{ name: "id" }, { name: "title" }], {
                contentTable: "notes",
                tokenizer: ["trigram", "remove_diacritics 1"]
            }).execute(tx);
            yield createFTS5Table("content_fts", [{ name: "id" }, { name: "noteId" }, { name: "data" }], {
                contentTable: "content",
                tokenizer: ["trigram", "remove_diacritics 1"]
            }).execute(tx);
        }));
        yield (0, fts_js_1.rebuildSearchIndex)(db);
    });
}
function hasColumn(db, tableName, columnName) {
    return __awaiter(this, void 0, void 0, function* () {
        const result = yield (0, kysely_1.sql) `
    SELECT name
    FROM pragma_table_info(${tableName})
    WHERE name = ${columnName}
  `.execute(db);
        return result.rows.length > 0;
    });
}
function ensureColumn(db, tableName, columnName, callback) {
    return __awaiter(this, void 0, void 0, function* () {
        if (yield hasColumn(db, tableName, columnName))
            return;
        yield callback();
    });
}
