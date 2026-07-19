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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const common_js_1 = require("../common.js");
const migrator_js_1 = __importDefault(require("../database/migrator.js"));
const collections = [
    {
        name: "settings",
        table: "settings"
    },
    {
        name: "settingsv2",
        table: "settings"
    },
    {
        name: "attachments",
        table: "attachments"
    },
    {
        name: "notebooks",
        table: "notebooks"
    },
    {
        name: "tags",
        table: "tags"
    },
    {
        name: "colors",
        table: "colors"
    },
    {
        name: "content",
        table: "content"
    },
    {
        name: "shortcuts",
        table: "shortcuts"
    },
    {
        name: "reminders",
        table: "reminders"
    },
    {
        name: "relations",
        table: "relations"
    },
    {
        name: "notehistory",
        table: "notehistory"
    },
    {
        name: "sessioncontent",
        table: "sessioncontent"
    },
    {
        name: "notes",
        table: "notes"
    },
    {
        name: "vaults",
        table: "vaults"
    }
];
class Migrations {
    constructor(db) {
        this.db = db;
        this.migrator = new migrator_js_1.default();
        this.migrating = false;
        this.version = common_js_1.CURRENT_DATABASE_VERSION;
    }
    init() {
        return __awaiter(this, void 0, void 0, function* () {
            this.version =
                (yield this.db.kv().read("v")) ||
                    (yield this.db.storage().read("v")) ||
                    common_js_1.CURRENT_DATABASE_VERSION;
            yield this.db.kv().write("v", this.version);
        });
    }
    required() {
        return this.version < common_js_1.CURRENT_DATABASE_VERSION;
    }
    migrate() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (!this.required() || this.migrating)
                    return;
                this.migrating = true;
                yield this.migrator.migrate(this.db, collections, this.version);
                yield this.db.kv().write("v", common_js_1.CURRENT_DATABASE_VERSION);
                this.version = common_js_1.CURRENT_DATABASE_VERSION;
            }
            finally {
                this.migrating = false;
            }
        });
    }
}
exports.default = Migrations;
