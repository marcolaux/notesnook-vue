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
exports.HEADLINE_REGEX = exports.NEWLINE_STRIP_REGEX = void 0;
exports.formatTitle = formatTitle;
const date_js_1 = require("./date.js");
exports.NEWLINE_STRIP_REGEX = /[\r\n\t\v]+/gm;
exports.HEADLINE_REGEX = /\$headline\$/g;
const DATE_REGEX = /\$date\$/g;
const COUNT_REGEX = /\$count\$/g;
const TIME_REGEX = /\$time\$/g;
const DAY_REGEX = /\$day\$/g;
const TIMESTAMP_REGEX = /\$timestamp\$/g;
const TIMESTAMP_Z_REGEX = /\$timestampz\$/g;
const DATE_TIME_STRIP_REGEX = /[\\\-:./, ]/g;
function formatTitle(titleFormat, dateFormat, timeFormat, dayFormat, headline = "", totalNotes = 0) {
    const date = (0, date_js_1.formatDate)(Date.now(), {
        dateFormat,
        type: "date"
    });
    const time = (0, date_js_1.formatDate)(Date.now(), {
        timeFormat,
        type: "time"
    });
    const timezone = (0, date_js_1.formatDate)(Date.now(), {
        type: "timezone"
    });
    const day = (0, date_js_1.formatDate)(Date.now(), {
        dayFormat,
        type: "day"
    });
    const timestamp = `${date}${time}`.replace(DATE_TIME_STRIP_REGEX, "");
    const timestampWithTimeZone = `${timestamp}${timezone}`;
    return titleFormat
        .replace(exports.NEWLINE_STRIP_REGEX, " ")
        .replace(DATE_REGEX, date)
        .replace(TIME_REGEX, time)
        .replace(DAY_REGEX, day)
        .replace(exports.HEADLINE_REGEX, headline || "")
        .replace(TIMESTAMP_REGEX, timestamp)
        .replace(TIMESTAMP_Z_REGEX, timestampWithTimeZone)
        .replace(COUNT_REGEX, `${totalNotes + 1}`);
}
