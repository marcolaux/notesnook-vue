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
exports.KVStorage = exports.KEYS = void 0;
exports.KEYS = [
    "v",
    "lastSynced",
    "user",
    "token",
    "monographs",
    "deviceId",
    "lastBackupTime",
    "fullOfflineMode"
];
class KVStorage {
    constructor(db) {
        this.db = db;
    }
    read(key) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.db.then((db) => db
                .selectFrom("kv")
                .where("key", "==", key)
                .select("value")
                .limit(1)
                .executeTakeFirst());
            if (!(result === null || result === void 0 ? void 0 : result.value))
                return;
            return JSON.parse(result.value);
        });
    }
    write(key, value) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.db.then((db) => db
                .replaceInto("kv")
                .values({
                key,
                value: JSON.stringify(value),
                dateModified: Date.now()
            })
                .execute());
        });
    }
    delete(key) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.db.then((db) => db.deleteFrom("kv").where("key", "==", key).execute());
        });
    }
    clear() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.db.then((db) => db.deleteFrom("kv").execute());
        });
    }
}
exports.KVStorage = KVStorage;
