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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DataURL = exports.sanitizeTag = exports.VAULT_ERRORS = exports.isReminderActive = exports.isReminderToday = exports.formatReminderTime = exports.getUpcomingReminder = exports.FilteredSelector = exports.EMPTY_CONTENT = exports.DefaultColors = exports.Database = void 0;
__exportStar(require("./types.js"), exports);
__exportStar(require("./interfaces.js"), exports);
__exportStar(require("./utils/index.js"), exports);
__exportStar(require("./content-types/index.js"), exports);
__exportStar(require("./common.js"), exports);
var index_js_1 = require("./api/index.js");
Object.defineProperty(exports, "Database", { enumerable: true, get: function () { return __importDefault(index_js_1).default; } });
var colors_js_1 = require("./collections/colors.js");
Object.defineProperty(exports, "DefaultColors", { enumerable: true, get: function () { return colors_js_1.DefaultColors; } });
var content_js_1 = require("./collections/content.js");
Object.defineProperty(exports, "EMPTY_CONTENT", { enumerable: true, get: function () { return content_js_1.EMPTY_CONTENT; } });
var sql_collection_js_1 = require("./database/sql-collection.js");
Object.defineProperty(exports, "FilteredSelector", { enumerable: true, get: function () { return sql_collection_js_1.FilteredSelector; } });
var reminders_js_1 = require("./collections/reminders.js");
Object.defineProperty(exports, "getUpcomingReminder", { enumerable: true, get: function () { return reminders_js_1.getUpcomingReminder; } });
Object.defineProperty(exports, "formatReminderTime", { enumerable: true, get: function () { return reminders_js_1.formatReminderTime; } });
Object.defineProperty(exports, "isReminderToday", { enumerable: true, get: function () { return reminders_js_1.isReminderToday; } });
Object.defineProperty(exports, "isReminderActive", { enumerable: true, get: function () { return reminders_js_1.isReminderActive; } });
__exportStar(require("./logger.js"), exports);
__exportStar(require("./api/debug.js"), exports);
__exportStar(require("./api/monographs.js"), exports);
__exportStar(require("./api/subscriptions.js"), exports);
__exportStar(require("./api/pricing.js"), exports);
__exportStar(require("./api/circle.js"), exports);
var vault_js_1 = require("./api/vault.js");
Object.defineProperty(exports, "VAULT_ERRORS", { enumerable: true, get: function () { return vault_js_1.VAULT_ERRORS; } });
var tags_js_1 = require("./collections/tags.js");
Object.defineProperty(exports, "sanitizeTag", { enumerable: true, get: function () { return tags_js_1.sanitizeTag; } });
var dataurl_js_1 = require("./utils/dataurl.js");
Object.defineProperty(exports, "DataURL", { enumerable: true, get: function () { return __importDefault(dataurl_js_1).default; } });
