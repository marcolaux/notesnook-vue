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
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSortValue = void 0;
exports.getSortSelectors = getSortSelectors;
exports.createKeySelector = createKeySelector;
exports.groupArray = groupArray;
const reminders_js_1 = require("../collections/reminders.js");
const date_js_1 = require("../utils/date.js");
const getSortValue = (options, item) => {
    if ((options === null || options === void 0 ? void 0 : options.sortBy) === "dateDeleted" &&
        "dateDeleted" in item &&
        item.dateDeleted)
        return item.dateDeleted;
    else if ((options === null || options === void 0 ? void 0 : options.sortBy) === "dateEdited" &&
        "dateEdited" in item &&
        item.dateEdited)
        return item.dateEdited;
    return item.dateCreated || 0;
};
exports.getSortValue = getSortValue;
function getSortSelectors(options) {
    if (options.sortBy === "title")
        return {
            asc: (a, b) => getTitle(a).localeCompare(getTitle(b), undefined, { numeric: true }),
            desc: (a, b) => getTitle(b).localeCompare(getTitle(a), undefined, { numeric: true })
        };
    return {
        asc: (a, b) => (0, exports.getSortValue)(options, a) - (0, exports.getSortValue)(options, b),
        desc: (a, b) => (0, exports.getSortValue)(options, b) - (0, exports.getSortValue)(options, a)
    };
}
const MILLISECONDS_IN_DAY = 1000 * 60 * 60 * 24;
const MILLISECONDS_IN_WEEK = MILLISECONDS_IN_DAY * 7;
function createKeySelector(options = {
    groupBy: "default",
    sortBy: "dateEdited",
    sortDirection: "desc"
}) {
    return (item) => {
        if ("pinned" in item && item.pinned)
            return "Pinned";
        else if ("conflicted" in item && item.conflicted)
            return "Conflicted";
        const date = new Date();
        if (item.type === "reminder")
            return (0, reminders_js_1.isReminderActive)(item) ? "Active" : "Inactive";
        else if (options.groupBy === "abc")
            return getFirstCharacter(getTitle(item));
        else {
            const value = (0, exports.getSortValue)(options, item) || 0;
            switch (options.groupBy) {
                case "none":
                    return "All";
                case "month":
                    date.setTime(value);
                    return `${date_js_1.MONTHS_FULL[date.getMonth()]} ${date.getFullYear()}`;
                case "week":
                    return (0, date_js_1.getWeekGroupFromTimestamp)(value);
                case "year":
                    date.setTime(value);
                    return date.getFullYear().toString();
                case "default":
                default: {
                    return value > date.getTime() - MILLISECONDS_IN_WEEK
                        ? "Recent"
                        : value > date.getTime() - MILLISECONDS_IN_WEEK * 2
                            ? "Last week"
                            : "Older";
                }
            }
        }
    };
}
function groupArray(items, keySelector) {
    const groups = new Map();
    for (let i = 0; i < items.length; ++i) {
        const item = items[i];
        const groupTitle = keySelector(item);
        const group = groups.get(groupTitle);
        if (typeof group === "undefined")
            groups.set(groupTitle, [
                i,
                {
                    index: i,
                    group: { id: groupTitle, title: groupTitle, type: "header" }
                }
            ]);
    }
    return new Map(groups.values());
}
function getFirstCharacter(str) {
    if (!str)
        return "-";
    str = str.trim();
    if (str.length <= 0)
        return "-";
    return str[0].toUpperCase();
}
function getTitle(item) {
    return ("filename" in item ? item.filename : item.title) || "Unknown";
}
