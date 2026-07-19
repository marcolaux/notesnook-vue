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
import { logger } from "../logger.js";
export class Sanitizer {
    constructor(db) {
        this.db = db;
        this.tables = {};
        this.logger = logger.scope("sanitizer");
    }
    init() {
        return __awaiter(this, void 0, void 0, function* () {
            const metadata = yield this.db().introspection.getTables({
                withInternalKyselyTables: false
            });
            for (const table of metadata) {
                this.tables[table.name] = new Set(table.columns.map((c) => c.name));
            }
        });
    }
    /**
     * Sanitization is done based on the latest table schema in the database. All
     * unrecognized keys are removed
     */
    sanitize(table, item) {
        const schema = this.tables[table];
        if (!schema) {
            if (process.env.NODE_ENV === "test")
                throw new Error(`Invalid table: ${table} (expected one of ${Object.keys(this.tables).join(", ")})`);
            return false;
        }
        for (const key in item) {
            if (schema.has(key))
                continue;
            if (process.env.NODE_ENV === "test")
                throw new Error(`Found invalid key in item ${key} (${table}) ${JSON.stringify(item)}`);
            else
                this.logger.debug("Found invalid key in item", {
                    table,
                    key,
                    value: item[key]
                });
            delete item[key];
        }
        return true;
    }
}
