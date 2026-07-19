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
import { SQLCachedCollection } from "../database/sql-cached-collection.js";
const ALLOWED_SHORTCUT_TYPES = ["notebook", "topic", "tag"];
export class Shortcuts {
    constructor(db) {
        this.db = db;
        this.name = "shortcuts";
        this.collection = new SQLCachedCollection(db.sql, db.transaction, "shortcuts", db.eventManager, db.sanitizer);
    }
    init() {
        return this.collection.init();
    }
    add(shortcut) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!shortcut)
                return;
            if (shortcut.remote)
                throw new Error("Please use db.shortcuts.merge to merge remote shortcuts.");
            if (shortcut.itemId &&
                shortcut.itemType &&
                !ALLOWED_SHORTCUT_TYPES.includes(shortcut.itemType))
                throw new Error("Cannot create a shortcut for this type of item.");
            const oldShortcut = shortcut.itemId
                ? this.shortcut(shortcut.itemId)
                : shortcut.id
                    ? this.shortcut(shortcut.id)
                    : null;
            shortcut = Object.assign(Object.assign({}, oldShortcut), shortcut);
            if (!shortcut.itemId || !shortcut.itemType)
                throw new Error("Cannot create a shortcut without an item.");
            const id = shortcut.id || shortcut.itemId;
            yield this.collection.upsert({
                id,
                type: "shortcut",
                itemId: shortcut.itemId,
                itemType: shortcut.itemType,
                dateCreated: shortcut.dateCreated || Date.now(),
                dateModified: shortcut.dateModified || Date.now(),
                sortIndex: -1 // await this.collection.count()
            });
            return id;
        });
    }
    // get raw() {
    //   return this.collection.raw();
    // }
    get all() {
        return this.collection.items();
    }
    resolved() {
        return __awaiter(this, arguments, void 0, function* (type = "all") {
            const tagIds = [];
            const notebookIds = [];
            for (const shortcut of this.all) {
                if ((type === "all" || type === "notebooks") &&
                    shortcut.itemType === "notebook")
                    notebookIds.push(shortcut.itemId);
                else if ((type === "all" || type === "tags") &&
                    shortcut.itemType === "tag")
                    tagIds.push(shortcut.itemId);
            }
            const notebooks = notebookIds.length > 0
                ? yield this.db.notebooks.all.items(notebookIds)
                : [];
            const tags = tagIds.length > 0 ? yield this.db.tags.all.items(tagIds) : [];
            const sortedItems = [];
            this.all
                .sort((a, b) => a.dateCreated - b.dateCreated)
                .forEach((shortcut) => {
                if (type === "all" || type === "notebooks") {
                    const notebook = notebooks.find((n) => n.id === shortcut.itemId);
                    if (notebook)
                        sortedItems.push(notebook);
                }
                if (type === "all" || type === "tags") {
                    const tag = tags.find((t) => t.id === shortcut.itemId);
                    if (tag)
                        sortedItems.push(tag);
                }
            });
            return sortedItems;
        });
    }
    exists(id) {
        return this.collection.exists(id);
    }
    shortcut(id) {
        return this.collection.get(id);
    }
    remove(...shortcutIds) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.collection.softDelete(shortcutIds);
            // await this.db
            //   .sql()
            //   .deleteFrom("shortcuts")
            //   .where((eb) =>
            //     eb.or([eb("id", "in", shortcutIds), eb("itemId", "in", shortcutIds)])
            //   )
            //   .execute();
            // const shortcuts = this.all.filter(
            //   (shortcut) =>
            //     shortcutIds.includes(shortcut.item.id) ||
            //     shortcutIds.includes(shortcut.id)
            // );
            // for (const { id } of shortcuts) {
            //   await this.collection.remove(id);
            // }
        });
    }
}
