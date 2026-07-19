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
import { getId } from "../utils/id.js";
import { sanitizeTag } from "./tags.js";
import { SQLCollection } from "../database/sql-collection.js";
import { isFalse } from "../database/index.js";
export const DefaultColors = {
    red: "#f44336",
    orange: "#FF9800",
    yellow: "#FFD600",
    green: "#4CAF50",
    blue: "#2196F3",
    purple: "#673AB7",
    gray: "#9E9E9E"
};
export class Colors {
    constructor(db) {
        this.db = db;
        this.name = "colors";
        this.collection = new SQLCollection(db.sql, db.transaction, "colors", db.eventManager, db.sanitizer);
    }
    init() {
        return this.collection.init();
    }
    color(id) {
        return this.collection.get(id);
    }
    find(colorCode) {
        return this.all.find((eb) => eb.and([eb("colorCode", "==", colorCode)]));
    }
    // async merge(remoteColor: MaybeDeletedItem<Color>) {
    //   if (!remoteColor) return;
    //   const localColor = this.collection.get(remoteColor.id);
    //   if (!localColor || remoteColor.dateModified > localColor.dateModified)
    //     await this.collection.add(remoteColor);
    // }
    add(item) {
        return __awaiter(this, void 0, void 0, function* () {
            item.title = item.title ? sanitizeTag(item.title) : item.title;
            const oldColor = item.id
                ? yield this.color(item.id)
                : item.colorCode
                    ? yield this.find(item.colorCode)
                    : undefined;
            if (!item.title && !(oldColor === null || oldColor === void 0 ? void 0 : oldColor.title))
                throw new Error("Title is required.");
            if (!item.colorCode && !(oldColor === null || oldColor === void 0 ? void 0 : oldColor.colorCode))
                throw new Error("Color code is required.");
            if (oldColor) {
                yield this.collection.update([oldColor.id], item);
                return oldColor.id;
            }
            const id = item.id || getId(item.dateCreated);
            yield this.collection.upsert({
                id,
                dateCreated: item.dateCreated || Date.now(),
                dateModified: item.dateModified || Date.now(),
                title: item.title || "",
                colorCode: item.colorCode || "",
                type: "color",
                remote: false
            });
            return id;
        });
    }
    // get raw() {
    //   return this.collection.raw();
    // }
    get all() {
        var _a;
        return this.collection.createFilter((qb) => qb.where(isFalse("deleted")), (_a = this.db.options) === null || _a === void 0 ? void 0 : _a.batchSize);
    }
    count(id) {
        return __awaiter(this, void 0, void 0, function* () {
            const color = yield this.color(id);
            if (!color)
                return;
            return this.db.relations.from(color, "note").count();
        });
    }
    remove(...ids) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.db.transaction(() => __awaiter(this, void 0, void 0, function* () {
                yield this.db.relations.unlinkOfType("color", ids);
                yield this.collection.softDelete(ids);
            }));
        });
    }
    // async delete(id: string) {
    //   await this.collection.delete(id);
    //   await this.db.relations.cleanup();
    // }
    exists(id) {
        return this.collection.exists(id);
    }
}
