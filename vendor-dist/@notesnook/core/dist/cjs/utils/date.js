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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MONTHS_FULL = void 0;
exports.getWeekGroupFromTimestamp = getWeekGroupFromTimestamp;
exports.getTimeFormat = getTimeFormat;
exports.formatDate = formatDate;
const dayjs_1 = __importDefault(require("dayjs"));
const advancedFormat_js_1 = __importDefault(require("dayjs/plugin/advancedFormat.js"));
const timezone_js_1 = __importDefault(require("dayjs/plugin/timezone.js"));
dayjs_1.default.extend(advancedFormat_js_1.default);
dayjs_1.default.extend(timezone_js_1.default);
function getWeekGroupFromTimestamp(timestamp) {
    const date = new Date(timestamp);
    const { start, end } = getWeek(date);
    const startMonth = start.month !== end.month ? " " + MONTHS_SHORT[start.month] : "";
    const startYear = start.year !== end.year ? ", " + start.year : "";
    const startDate = `${start.day}${startMonth}${startYear}`;
    const endDate = `${end.day} ${MONTHS_SHORT[end.month]}, ${end.year}`;
    return `${startDate} - ${endDate}`;
}
const MS_IN_HOUR = 3600000;
function getWeek(date) {
    const day = date.getDay() || 7;
    if (day !== 1) {
        const hours = 24 * (day - 1);
        date.setTime(date.getTime() - MS_IN_HOUR * hours);
    }
    const start = {
        month: date.getMonth(),
        year: date.getFullYear(),
        day: date.getDate()
    };
    const hours = 24 * 6;
    date.setTime(date.getTime() + MS_IN_HOUR * hours);
    const end = {
        month: date.getMonth(),
        year: date.getFullYear(),
        day: date.getDate()
    };
    return { start, end };
}
function getTimeFormat(format) {
    return format === "12-hour" ? "hh:mm A" : "HH:mm";
}
function getDayFormat(format) {
    return format === "short" ? "ddd" : "dddd";
}
function formatDate(date, options = {
    dateFormat: "DD-MM-YYYY",
    timeFormat: "12-hour",
    type: "date-time"
}) {
    switch (options.type) {
        case "date-time-timezone":
            return (0, dayjs_1.default)(date).format(`${options.dateFormat} ${getTimeFormat(options.timeFormat)} z`);
        case "date-time":
            return (0, dayjs_1.default)(date).format(`${options.dateFormat} ${getTimeFormat(options.timeFormat)}`);
        case "time":
            return (0, dayjs_1.default)(date).format(getTimeFormat(options.timeFormat));
        case "date":
            return (0, dayjs_1.default)(date).format(options.dateFormat);
        case "day":
            return (0, dayjs_1.default)(date).format(getDayFormat(options.dayFormat));
        case "timezone":
            return (0, dayjs_1.default)(date).format("ZZ");
    }
}
exports.MONTHS_FULL = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December"
];
const MONTHS_SHORT = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec"
];
