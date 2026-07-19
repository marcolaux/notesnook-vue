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
exports.LegacySettings = void 0;
const id_js_1 = require("../utils/id.js");
/**
 * @deprecated only kept here for migration purposes
 */
class LegacySettings {
    constructor(db) {
        this.db = db;
        this.name = "legacy-settings";
        this.settings = {
            type: "settings",
            dateModified: 0,
            dateCreated: 0,
            id: (0, id_js_1.getId)()
        };
    }
    init() {
        return __awaiter(this, void 0, void 0, function* () {
            const settings = yield this.db
                .storage()
                .read("settings");
            if (settings)
                this.settings = settings;
        });
    }
    get raw() {
        return this.settings;
    }
    /**
     * @deprecated only kept here for migration purposes
     */
    getAlias(id) {
        return this.settings.aliases && this.settings.aliases[id];
    }
}
exports.LegacySettings = LegacySettings;
