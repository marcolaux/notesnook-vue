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
exports.migrateItem = migrateItem;
exports.migrateCollection = migrateCollection;
exports.migrateVaultKey = migrateVaultKey;
exports.migrateKV = migrateKV;
exports.tinyToTiptap = tinyToTiptap;
const html_parser_js_1 = require("./utils/html-parser.js");
const entities_1 = require("entities");
const common_js_1 = require("./common.js");
const id_js_1 = require("./utils/id.js");
const types_js_1 = require("./types.js");
const crypto_js_1 = require("./utils/crypto.js");
const colors_js_1 = require("./collections/colors.js");
const kv_js_1 = require("./database/kv.js");
const migrations = [
    { version: 5.0, items: {} },
    { version: 5.1, items: {} },
    {
        version: 5.2,
        items: {
            note: replaceDateEditedWithDateModified(false),
            notebook: replaceDateEditedWithDateModified(false),
            tag: replaceDateEditedWithDateModified(true),
            attachment: replaceDateEditedWithDateModified(true),
            trash: replaceDateEditedWithDateModified(false),
            tiny: (item) => {
                replaceDateEditedWithDateModified(false)(item);
                if (!item.data || (0, crypto_js_1.isCipher)(item.data))
                    return true;
                item.data = removeToxClassFromChecklist(wrapTablesWithDiv(item.data));
                return true;
            },
            settings: replaceDateEditedWithDateModified(true)
        }
    },
    {
        version: 5.3,
        items: {
            tiny: (item) => {
                if (!item.data || (0, crypto_js_1.isCipher)(item.data))
                    return false;
                item.data = decodeWrappedTableHtml(item.data);
                return true;
            }
        }
    },
    {
        version: 5.4,
        items: {
            tiny: (item) => {
                if (!item.data || (0, crypto_js_1.isCipher)(item.data))
                    return false;
                item.type = "tiptap";
                item.data = tinyToTiptap(item.data);
                return true;
            }
        }
    },
    {
        version: 5.5,
        items: {}
    },
    {
        version: 5.6,
        items: {
            notebook: (item) => {
                if (!item.topics)
                    return false;
                item.topics = item.topics.map((topic) => {
                    delete topic.notes;
                    return topic;
                });
                return item.topics.length > 0;
            },
            settings: (item, db) => __awaiter(void 0, void 0, void 0, function* () {
                if (!item.pins)
                    return false;
                for (const pin of item.pins) {
                    if (!pin.data)
                        continue;
                    yield db.shortcuts.add({
                        itemId: pin.data.id,
                        itemType: pin.type === "topic" ? "notebook" : pin.type
                    });
                }
                delete item.pins;
                return true;
            })
        }
    },
    {
        version: 5.7,
        items: {
            tiny: (item) => {
                item.type = "tiptap";
                return changeSessionContentType(item);
            },
            content: (item) => {
                const oldType = item.type;
                item.type = "tiptap";
                return oldType !== item.type;
            },
            shortcut: (item) => {
                if (!item.item || item.id === item.item.id)
                    return false;
                item.id = item.item.id;
                return true;
            },
            tiptap: (item) => {
                return changeSessionContentType(item);
            },
            notehistory: (item) => {
                const oldType = item.type;
                item.type = "session";
                return oldType !== item.type;
            }
        },
        collection: (collection) => __awaiter(void 0, void 0, void 0, function* () {
            yield collection.indexer.migrateIndices();
        })
    },
    {
        version: 5.8,
        items: {},
        all: (item, _db, migrationType) => {
            if (migrationType === "local") {
                delete item.remote;
                return true;
            }
        }
    },
    {
        version: 5.9,
        items: {
            trash: (item) => {
                if (!item.deletedBy)
                    item.deletedBy = "user";
                delete item.itemId;
                return true;
            },
            color: (item, db, migrationType) => __awaiter(void 0, void 0, void 0, function* () {
                var _a, _b, _c;
                return ((yield ((_c = (_a = migrations
                    .find((migration) => migration.version === 5.9)) === null || _a === void 0 ? void 0 : (_b = _a.items).tag) === null || _c === void 0 ? void 0 : _c.call(_b, item, db, migrationType))) || false);
            }),
            tag: (item, db) => __awaiter(void 0, void 0, void 0, function* () {
                const oldTagId = (0, id_js_1.makeId)(item.title);
                const alias = db.legacySettings.getAlias(item.id);
                if (!alias &&
                    (db.legacyTags
                        .items()
                        .find((t) => item.title === t.title && t.id !== oldTagId) ||
                        db.legacyColors
                            .items()
                            .find((t) => item.title === t.title && t.id !== oldTagId)))
                    return "skip";
                const colorCode = colors_js_1.DefaultColors[item.title];
                if (colorCode) {
                    const newColor = yield db.colors.all.find((eb) => eb("title", "in", [alias, item.title]));
                    if (newColor)
                        return "skip";
                    item.type = "color";
                    item.colorCode = colorCode;
                }
                else {
                    const newTag = yield db.tags.all.find((eb) => eb("title", "in", [alias, item.title]));
                    if (newTag)
                        return "skip";
                }
                // there's a case where dateCreated is null in tags
                item.dateCreated = item.dateCreated || Date.now();
                item.title = alias || item.title;
                item.id = (0, id_js_1.makeId)(item.title);
                delete item.localOnly;
                delete item.noteIds;
                delete item.alias;
                return true;
            }),
            note: (item, db) => __awaiter(void 0, void 0, void 0, function* () {
                for (const tag of item.tags || []) {
                    if (!tag)
                        continue;
                    const oldTagId = (0, id_js_1.makeId)(tag);
                    const oldTag = db.legacyTags.get(oldTagId);
                    const alias = db.legacySettings.getAlias(oldTagId);
                    const newTag = yield db.tags.all.find((eb) => eb("title", "in", [alias, tag]));
                    const newTagId = (newTag === null || newTag === void 0 ? void 0 : newTag.id) ||
                        (yield db.tags.add({
                            // IMPORTANT: the id must be deterministic to avoid creating
                            // duplicate colors when migrating on different devices
                            id: (0, id_js_1.makeId)(alias || tag),
                            dateCreated: oldTag === null || oldTag === void 0 ? void 0 : oldTag.dateCreated,
                            dateModified: oldTag === null || oldTag === void 0 ? void 0 : oldTag.dateModified,
                            title: alias || tag,
                            type: "tag"
                        }));
                    if (!newTagId)
                        continue;
                    yield db.relations.add({ type: "tag", id: newTagId }, item);
                    yield db.legacyTags.delete(oldTagId);
                }
                if (item.color) {
                    const oldColorId = (0, id_js_1.makeId)(item.color);
                    const oldColor = db.legacyColors.get(oldColorId);
                    const alias = db.legacySettings.getAlias(oldColorId);
                    const newColor = yield db.colors.all.find((eb) => eb("title", "in", [alias, item.color]));
                    const newColorId = (newColor === null || newColor === void 0 ? void 0 : newColor.id) ||
                        (yield db.colors.add({
                            // IMPORTANT: the id must be deterministic to avoid creating
                            // duplicate colors when migrating on different devices
                            id: (0, id_js_1.makeId)(alias || item.color),
                            dateCreated: oldColor === null || oldColor === void 0 ? void 0 : oldColor.dateCreated,
                            dateModified: oldColor === null || oldColor === void 0 ? void 0 : oldColor.dateModified,
                            title: alias || item.color,
                            colorCode: colors_js_1.DefaultColors[item.color],
                            type: "color"
                        }));
                    if (newColorId) {
                        yield db.relations.add({ type: "color", id: newColorId }, item);
                        yield db.legacyColors.delete(oldColorId);
                    }
                }
                if (item.notebooks) {
                    for (const notebook of item.notebooks) {
                        for (const topic of notebook.topics) {
                            yield db.relations.add({ type: "notebook", id: topic }, item);
                        }
                    }
                }
                if (item.locked) {
                    const vault = yield db.vaults.default();
                    if (vault)
                        yield db.relations.add({ type: "vault", id: vault.id }, item);
                }
                delete item.locked;
                delete item.notebooks;
                delete item.tags;
                delete item.color;
                return true;
            }),
            attachment: (item, db) => __awaiter(void 0, void 0, void 0, function* () {
                for (const noteId of item.noteIds || []) {
                    yield db.relations.add({ type: "note", id: noteId }, { type: "attachment", id: item.id });
                }
                if (item.metadata) {
                    item.hash = item.metadata.hash;
                    item.mimeType = item.metadata.type;
                    item.hashType = item.metadata.hashType;
                    item.filename = item.metadata.filename;
                }
                if (item.length)
                    item.size = item.length;
                delete item.length;
                delete item.metadata;
                delete item.noteIds;
                return true;
            }),
            notebook: (item, db) => __awaiter(void 0, void 0, void 0, function* () {
                for (const topic of item.topics || []) {
                    const subNotebookId = yield db.notebooks.add({
                        id: topic.id,
                        title: topic.title,
                        dateCreated: topic.dateCreated,
                        dateEdited: topic.dateEdited,
                        dateModified: topic.dateModified
                    });
                    if (!subNotebookId)
                        continue;
                    yield db.relations.add(item, { id: subNotebookId, type: "notebook" });
                    // if the parent notebook is deleted, we should delete the newly
                    // created notebooks too
                    if (item.dateDeleted) {
                        yield db.trash.add("notebook", [subNotebookId], "app");
                    }
                }
                delete item.topics;
                delete item.totalNotes;
                delete item.topic;
                return true;
            }),
            shortcut: (item) => {
                var _a;
                if (((_a = item.item) === null || _a === void 0 ? void 0 : _a.type) === "topic") {
                    item.item = { type: "notebook", id: item.item.id };
                }
                if (item.item) {
                    item.itemId = item.item.id;
                    item.itemType = item.item.type;
                }
                delete item.item;
                return true;
            },
            settings: (item, db) => __awaiter(void 0, void 0, void 0, function* () {
                if (item.trashCleanupInterval)
                    yield db.settings.setTrashCleanupInterval(item.trashCleanupInterval);
                if (item.defaultNotebook)
                    yield db.settings.setDefaultNotebook(item.defaultNotebook
                        ? item.defaultNotebook.topic || item.defaultNotebook.id
                        : undefined);
                if (item.titleFormat)
                    yield db.settings.setTitleFormat(item.titleFormat);
                if (item.dateFormat)
                    yield db.settings.setDateFormat(item.dateFormat);
                if (item.timeFormat)
                    yield db.settings.setTimeFormat(item.timeFormat);
                if (item.groupOptions) {
                    for (const key in item.groupOptions) {
                        if (!(0, types_js_1.isGroupingKey)(key))
                            continue;
                        const value = item.groupOptions[key];
                        if (!value)
                            continue;
                        if (key === "tags" && value.sortBy === "dateEdited")
                            value.sortBy = "dateModified";
                        yield db.settings.setGroupOptions(key, value);
                    }
                }
                if (item.toolbarConfig) {
                    for (const key in item.toolbarConfig) {
                        const value = item.toolbarConfig[key];
                        if (!value)
                            continue;
                        yield db.settings.setToolbarConfig(key, value);
                    }
                }
                return true;
            }),
            relation: (item) => {
                item.fromId = item.from.id;
                item.fromType = item.from.type;
                item.toId = item.to.id;
                item.toType = item.to.type;
                delete item.to;
                delete item.from;
                return true;
            },
            tiptap: (item) => {
                item.locked = (0, crypto_js_1.isCipher)(item.data);
                delete item.resolved;
                return true;
            },
            tiny: (item) => {
                delete item.resolved;
                return true;
            },
            notehistory: (item) => {
                delete item.data;
                return true;
            }
        },
        all: (item) => {
            delete item.deleteReason;
            return true;
        },
        vaultKey(db, key) {
            return __awaiter(this, void 0, void 0, function* () {
                yield db.vaults.add({ title: "Default", key });
                yield db.storage().remove("vaultKey");
            });
        },
        kv(db) {
            return __awaiter(this, void 0, void 0, function* () {
                for (const key of kv_js_1.KEYS) {
                    const value = yield db.storage().read(key);
                    if (value === undefined || value === null)
                        continue;
                    yield db.kv().write(key, value);
                    yield db.storage().remove(key);
                }
            });
        }
    },
    {
        version: 6.0,
        items: {
            note: (item) => {
                delete item.locked;
                return true;
            }
        },
        all: (item) => {
            if ((0, types_js_1.isDeleted)(item)) {
                const allowedKeys = [
                    "deleted",
                    "dateModified",
                    "id",
                    "synced",
                    "remote"
                ];
                for (const key in item) {
                    if (allowedKeys.includes(key))
                        continue;
                    delete item[key];
                }
                return true;
            }
        }
    },
    { version: 6.1, items: {} }
];
function migrateItem(item, itemVersion, databaseVersion, type, database, migrationType) {
    return __awaiter(this, void 0, void 0, function* () {
        let migrationStartIndex = migrations.findIndex((m) => m.version === itemVersion);
        if (migrationStartIndex <= -1) {
            throw new Error(itemVersion > databaseVersion
                ? `Please update the app to the latest version.`
                : `You seem to be on a very outdated version. Please update the app to the latest version.`);
        }
        let count = 0;
        for (; migrationStartIndex < migrations.length; ++migrationStartIndex) {
            const migration = migrations[migrationStartIndex];
            if (migration.version === databaseVersion)
                break;
            let result = !!migration.all &&
                (yield migration.all(item, database, migrationType, type));
            if (result === "skip")
                return "skip";
            if (result) {
                if (!(0, types_js_1.isDeleted)(item) &&
                    item.type &&
                    item.type !== "trash" &&
                    item.type !== type)
                    type = item.type;
                count++;
            }
            const itemMigrator = migration.items[type];
            if ((0, types_js_1.isDeleted)(item) || !itemMigrator)
                continue;
            result = yield itemMigrator(item, database, migrationType);
            if (result === "skip")
                return "skip";
            if (result) {
                if (item.type && item.type !== "trash" && item.type !== type)
                    type = item.type;
                count++;
            }
        }
        return count > 0;
    });
}
/**
 * @deprecated
 */
function migrateCollection(collection, version) {
    return __awaiter(this, void 0, void 0, function* () {
        let migrationStartIndex = migrations.findIndex((m) => m.version === version);
        if (migrationStartIndex <= -1) {
            throw new Error(version > common_js_1.CURRENT_DATABASE_VERSION
                ? `Please update the app to the latest version.`
                : `You seem to be on a very outdated version. Please update the app to the latest version.`);
        }
        for (; migrationStartIndex < migrations.length; ++migrationStartIndex) {
            const migration = migrations[migrationStartIndex];
            if (migration.version === common_js_1.CURRENT_DATABASE_VERSION)
                break;
            if (!migration.collection)
                continue;
            yield migration.collection(collection);
        }
    });
}
/**
 * @deprecated
 */
function migrateVaultKey(db, vaultKey, version, databaseVersion) {
    return __awaiter(this, void 0, void 0, function* () {
        let migrationStartIndex = migrations.findIndex((m) => m.version === version);
        if (migrationStartIndex <= -1) {
            throw new Error(version > databaseVersion
                ? `Please update the app to the latest version.`
                : `You seem to be on a very outdated version. Please update the app to the latest version.`);
        }
        for (; migrationStartIndex < migrations.length; ++migrationStartIndex) {
            const migration = migrations[migrationStartIndex];
            if (migration.version === databaseVersion)
                break;
            if (!migration.vaultKey)
                continue;
            yield migration.vaultKey(db, vaultKey);
        }
    });
}
/**
 * @deprecated
 */
function migrateKV(db, version, databaseVersion) {
    return __awaiter(this, void 0, void 0, function* () {
        let migrationStartIndex = migrations.findIndex((m) => m.version === version);
        if (migrationStartIndex <= -1) {
            throw new Error(version > databaseVersion
                ? `Please update the app to the latest version.`
                : `You seem to be on a very outdated version. Please update the app to the latest version.`);
        }
        for (; migrationStartIndex < migrations.length; ++migrationStartIndex) {
            const migration = migrations[migrationStartIndex];
            if (migration.version === databaseVersion)
                break;
            if (!migration.kv)
                continue;
            yield migration.kv(db);
        }
    });
}
function replaceDateEditedWithDateModified(removeDateEditedProperty = false) {
    return function (item) {
        item.dateModified = item.dateEdited;
        if (removeDateEditedProperty)
            delete item.dateEdited;
        delete item.persistDateEdited;
        return true;
    };
}
function wrapTablesWithDiv(html) {
    const document = (0, html_parser_js_1.parseHTML)(html);
    if (!document)
        return html;
    const tables = document.getElementsByTagName("table");
    for (const table of tables) {
        table.setAttribute("contenteditable", "true");
        const div = document.createElement("div");
        div.setAttribute("contenteditable", "false");
        div.innerHTML = table.outerHTML;
        div.classList.add("table-container");
        table.replaceWith(div);
    }
    return "outerHTML" in document
        ? document.outerHTML
        : document.body.innerHTML;
}
function removeToxClassFromChecklist(html) {
    const document = (0, html_parser_js_1.parseHTML)(html);
    if (!document)
        return html;
    const checklists = document.querySelectorAll(".tox-checklist,.tox-checklist--checked");
    for (const item of checklists) {
        if (item.classList.contains("tox-checklist--checked"))
            item.classList.replace("tox-checklist--checked", "checked");
        else if (item.classList.contains("tox-checklist"))
            item.classList.replace("tox-checklist", "checklist");
    }
    return "outerHTML" in document
        ? document.outerHTML
        : document.body.innerHTML;
}
const regex = /&lt;div class="table-container".*&lt;\/table&gt;&lt;\/div&gt;/gm;
function decodeWrappedTableHtml(html) {
    return html.replace(regex, (match) => {
        const html = (0, entities_1.decodeHTML5)(match);
        return html;
    });
}
const NEWLINE_REPLACEMENT_REGEX = /\n|<br>|<br\/>/gm;
const PREBLOCK_REGEX = /(<pre.*?>)(.*?)(<\/pre>)/gm;
const SPAN_REGEX = /<span class=.*?>(.*?)<\/span>/gm;
function tinyToTiptap(html) {
    var _a;
    if (typeof html !== "string")
        return html;
    // Preserve newlines in pre blocks
    html = html
        .replace(/\n/gm, "<br/>")
        .replace(PREBLOCK_REGEX, (_pre, start, inner, end) => {
        let codeblock = start;
        codeblock += inner
            .replace(NEWLINE_REPLACEMENT_REGEX, "<br/>")
            .replace(SPAN_REGEX, (_span, inner) => inner);
        codeblock += end;
        return codeblock;
    });
    const document = (0, html_parser_js_1.parseHTML)(html);
    if (!document)
        return html;
    const tables = document.querySelectorAll("table");
    for (const table of tables) {
        table.removeAttribute("contenteditable");
        if (table.parentElement &&
            table.parentElement.nodeName.toLowerCase() === "div") {
            table.parentElement.replaceWith(table);
        }
    }
    const images = document.querySelectorAll("p > img");
    for (const image of images) {
        (_a = image.parentElement) === null || _a === void 0 ? void 0 : _a.replaceWith(image.cloneNode());
    }
    const bogus = document.querySelectorAll("[data-mce-bogus]");
    for (const element of bogus) {
        element.remove();
    }
    const attributes = document.querySelectorAll("[data-mce-href], [data-mce-flag]");
    for (const element of attributes) {
        element.removeAttribute("data-mce-href");
        element.removeAttribute("data-mce-flag");
    }
    return document.body.innerHTML;
}
function changeSessionContentType(item) {
    if (item.id.endsWith("_content")) {
        item.contentType = item.type;
        item.type = "sessioncontent";
        return true;
    }
    return false;
}
