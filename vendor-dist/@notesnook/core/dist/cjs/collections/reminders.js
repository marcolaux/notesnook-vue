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
exports.Reminders = void 0;
exports.formatReminderTime = formatReminderTime;
exports.isReminderToday = isReminderToday;
exports.getUpcomingReminderTime = getUpcomingReminderTime;
exports.getUpcomingReminder = getUpcomingReminder;
exports.isReminderActive = isReminderActive;
exports.createUpcomingReminderTimeQuery = createUpcomingReminderTimeQuery;
exports.createIsReminderActiveQuery = createIsReminderActiveQuery;
const dayjs_1 = __importDefault(require("dayjs"));
const isSameOrBefore_js_1 = __importDefault(require("dayjs/plugin/isSameOrBefore.js"));
const isToday_js_1 = __importDefault(require("dayjs/plugin/isToday.js"));
const isTomorrow_js_1 = __importDefault(require("dayjs/plugin/isTomorrow.js"));
const isYesterday_js_1 = __importDefault(require("dayjs/plugin/isYesterday.js"));
const date_js_1 = require("../utils/date.js");
const id_js_1 = require("../utils/id.js");
const sql_collection_js_1 = require("../database/sql-collection.js");
const index_js_1 = require("../database/index.js");
const kysely_1 = require("@streetwriters/kysely");
dayjs_1.default.extend(isTomorrow_js_1.default);
dayjs_1.default.extend(isSameOrBefore_js_1.default);
dayjs_1.default.extend(isYesterday_js_1.default);
dayjs_1.default.extend(isToday_js_1.default);
class Reminders {
    constructor(db) {
        this.db = db;
        this.name = "reminders";
        this.collection = new sql_collection_js_1.SQLCollection(db.sql, db.transaction, "reminders", db.eventManager, db.sanitizer);
    }
    init() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.collection.init();
        });
    }
    /**
     * Required to satisfy the ICollection interface.
     * This collection does not currently maintain a local cache that needs invalidation,
     * but the method must exist for type safety when iterating over all collections.
     */
    invalidateCache() { }
    add(reminder) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!reminder)
                return;
            if (reminder.remote)
                throw new Error("Please use db.reminders.merge to merge reminders.");
            const id = reminder.id || (0, id_js_1.getId)();
            const oldReminder = yield this.collection.get(id);
            reminder = Object.assign(Object.assign({}, oldReminder), reminder);
            if (!reminder.date || !reminder.title)
                throw new Error(`date and title are required in a reminder.`);
            yield this.collection.upsert({
                id,
                type: "reminder",
                dateCreated: reminder.dateCreated || Date.now(),
                dateModified: reminder.dateModified || Date.now(),
                date: reminder.date,
                description: reminder.description,
                mode: reminder.mode || "once",
                priority: reminder.priority || "vibrate",
                recurringMode: reminder.recurringMode,
                selectedDays: reminder.selectedDays || [],
                title: reminder.title,
                localOnly: reminder.localOnly,
                disabled: reminder.disabled,
                snoozeUntil: reminder.snoozeUntil
            });
            return id;
        });
    }
    // get raw() {
    //   return this.collection.raw();
    // }
    get all() {
        var _a;
        return this.collection.createFilter((qb) => qb.where((0, index_js_1.isFalse)("deleted")), (_a = this.db.options) === null || _a === void 0 ? void 0 : _a.batchSize);
    }
    get active() {
        var _a;
        return this.collection.createFilter((qb) => qb
            .where((0, index_js_1.isFalse)("deleted"))
            .where((eb) => eb.parens(createIsReminderActiveQuery())), (_a = this.db.options) === null || _a === void 0 ? void 0 : _a.batchSize);
    }
    exists(itemId) {
        return this.collection.exists(itemId);
    }
    reminder(id) {
        return this.collection.get(id);
    }
    remove(...reminderIds) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.collection.softDelete(reminderIds);
        });
    }
}
exports.Reminders = Reminders;
function formatReminderTime(reminder, short = false, options = {
    timeFormat: "12-hour",
    dateFormat: "DD-MM-YYYY"
}) {
    const { date } = reminder;
    let time = date;
    let tag = "";
    let text = "";
    if (reminder.mode === "permanent")
        return `Ongoing`;
    if (reminder.snoozeUntil && reminder.snoozeUntil > Date.now()) {
        return `Snoozed until ${(0, date_js_1.formatDate)(reminder.snoozeUntil, {
            timeFormat: options.timeFormat,
            type: "time"
        })}`;
    }
    if (reminder.mode === "repeat") {
        time = getUpcomingReminderTime(reminder);
    }
    const formattedTime = (0, date_js_1.formatDate)(time, {
        timeFormat: options.timeFormat,
        type: "time"
    });
    const formattedDateTime = (0, date_js_1.formatDate)(time, {
        dateFormat: `ddd, ${options.dateFormat}`,
        timeFormat: options.timeFormat,
        type: "date-time"
    });
    if ((0, dayjs_1.default)(time).isTomorrow()) {
        tag = "Upcoming";
        text = `Tomorrow, ${formattedTime}`;
    }
    else if ((0, dayjs_1.default)(time).isYesterday()) {
        tag = "Last";
        text = `Yesterday, ${formattedTime}`;
    }
    else {
        const isPast = (0, dayjs_1.default)(time).isSameOrBefore((0, dayjs_1.default)());
        tag = isPast ? "Last" : "Upcoming";
        if ((0, dayjs_1.default)(time).isToday()) {
            text = `Today, ${formattedTime}`;
        }
        else {
            text = formattedDateTime;
        }
    }
    return short ? text : `${tag}: ${text}`;
}
function isReminderToday(reminder) {
    const { date } = reminder;
    let time = date;
    if (reminder.mode === "permanent")
        return true;
    if (reminder.mode === "repeat") {
        time = getUpcomingReminderTime(reminder);
    }
    return (0, dayjs_1.default)(time).isToday();
}
function getUpcomingReminderTime(reminder) {
    if (reminder.mode === "once")
        return reminder.date;
    const isDay = reminder.recurringMode === "day";
    const isWeek = reminder.recurringMode === "week";
    const isMonth = reminder.recurringMode === "month";
    const isYear = reminder.recurringMode === "year";
    // this is only the time (hour & minutes) unless it is a
    // yearly reminder
    const time = (0, dayjs_1.default)(reminder.date);
    const now = (0, dayjs_1.default)();
    const relativeTime = isYear
        ? now
            .clone()
            .hour(time.hour())
            .minute(time.minute())
            .month(time.month())
            .date(time.date())
        : now.clone().hour(time.hour()).minute(time.minute());
    const isPast = relativeTime.isSameOrBefore(now);
    if (isYear) {
        if (isPast)
            return relativeTime.add(1, "year").valueOf();
        else
            return relativeTime.valueOf();
    }
    if (isDay) {
        if (isPast)
            return relativeTime.add(1, "day").valueOf();
        else
            return relativeTime.valueOf();
    }
    if (!reminder.selectedDays || !reminder.selectedDays.length)
        return relativeTime.valueOf();
    const sorted = reminder.selectedDays.sort((a, b) => a - b);
    const lastSelectedDay = sorted[sorted.length - 1];
    if (isWeek) {
        if (now.day() > lastSelectedDay ||
            (now.day() === lastSelectedDay && isPast))
            return relativeTime.day(sorted[0]).add(1, "week").valueOf();
        else {
            for (const selectedDay of sorted) {
                if (selectedDay > now.day() || (selectedDay === now.day() && !isPast))
                    return relativeTime.day(selectedDay).valueOf();
            }
        }
    }
    else if (isMonth) {
        if (now.date() > lastSelectedDay ||
            (now.date() === lastSelectedDay && isPast))
            return relativeTime.date(sorted[0]).add(1, "month").valueOf();
        else {
            for (const selectedDay of sorted) {
                if (selectedDay > now.date() || (now.date() === selectedDay && !isPast))
                    return relativeTime.date(selectedDay).valueOf();
            }
        }
    }
    return relativeTime.valueOf();
}
function getUpcomingReminder(reminders) {
    const sorted = reminders.sort((a, b) => {
        const d1 = a.mode === "repeat" ? getUpcomingReminderTime(a) : a.date;
        const d2 = b.mode === "repeat" ? getUpcomingReminderTime(b) : b.date;
        return !d1 || !d2 ? 0 : d2 - d1;
    });
    return sorted[0];
}
function isReminderActive(reminder) {
    return (!reminder.disabled &&
        (reminder.mode !== "once" ||
            reminder.date > Date.now() ||
            (!!reminder.snoozeUntil && reminder.snoozeUntil > Date.now())));
}
function createUpcomingReminderTimeQuery(unix = "now") {
    const time = (0, kysely_1.sql) `time(date / 1000, 'unixepoch', 'localtime')`;
    const dateNow = (0, kysely_1.sql) `date(${unix}, 'localtime')`;
    const dateTime = (0, kysely_1.sql) `datetime(${dateNow} || ${time})`;
    const dateTimeNow = (0, kysely_1.sql) `datetime(${unix}, 'localtime')`;
    const weekDayNow = (0, kysely_1.sql) `CAST(strftime('%w', ${dateNow}) AS INTEGER)`;
    const monthDayNow = (0, kysely_1.sql) `CAST(strftime('%d', ${dateNow}) AS INTEGER)`;
    const lastSelectedDay = (0, kysely_1.sql) `(SELECT MAX(value) FROM json_each(selectedDays))`;
    const monthDate = (0, kysely_1.sql) `strftime('%m-%d%H:%M', date / 1000, 'unixepoch', 'localtime')`;
    return (0, kysely_1.sql) `CASE
        WHEN mode = 'once' THEN date / 1000
        WHEN recurringMode = 'year' THEN
            strftime('%s',
                strftime('%Y-', ${dateNow}) || ${monthDate},
                IIF(datetime(strftime('%Y-', ${dateNow}) || ${monthDate}) <= ${dateTimeNow}, '+1 year', '+0 year'),
                'utc'
            )
        WHEN recurringMode = 'day' THEN
            strftime('%s',
                ${dateNow} || ${time},
                IIF(${dateTime} <= ${dateTimeNow}, '+1 day', '+0 day'),
                'utc'
            )
        WHEN recurringMode = 'week' AND selectedDays IS NOT NULL AND json_array_length(selectedDays) > 0 THEN
            CASE
                WHEN ${weekDayNow} > ${lastSelectedDay}
                OR (${weekDayNow} == ${lastSelectedDay} AND ${dateTime} <= ${dateTimeNow})
                THEN
                    strftime('%s', datetime(${dateNow}, ${time}, '+1 day', 'weekday ' || json_extract(selectedDays, '$[0]'), 'utc'))
                ELSE
                    strftime('%s', datetime(${dateNow}, ${time}, 'weekday ' || (SELECT value FROM json_each(selectedDays) WHERE value > ${weekDayNow} OR (value == ${weekDayNow} AND ${dateTime} > ${dateTimeNow})), 'utc'))
            END
        WHEN recurringMode = 'month' AND selectedDays IS NOT NULL AND json_array_length(selectedDays) > 0 THEN
            CASE
                WHEN ${monthDayNow} > ${lastSelectedDay}
                OR (${monthDayNow} == ${lastSelectedDay} AND datetime(${dateNow} || ${time}) <= ${dateTimeNow})
                THEN
                    strftime('%s', strftime('%Y-%m-', ${dateNow}) || printf('%02d', json_extract(selectedDays, '$[0]')) || ${time}, '+1 month', 'utc')
                ELSE strftime('%s', strftime('%Y-%m-', ${dateNow}) || (SELECT printf('%02d', value) FROM json_each(selectedDays) WHERE value > ${monthDayNow} OR (value == ${monthDayNow} AND ${dateTime} > ${dateTimeNow})) || ${time}, 'utc')
            END
        ELSE strftime('%s', ${dateNow} || ${time}, 'utc')
    END * 1000
`.$castTo();
}
function createIsReminderActiveQuery(now = "now") {
    return (0, kysely_1.sql) `IIF(
    (disabled IS NULL OR disabled = 0)
    AND (mode != 'once'
      OR datetime(date / 1000, 'unixepoch', 'localtime') > datetime(${now}, 'localtime')
      OR (snoozeUntil IS NOT NULL
        AND datetime(snoozeUntil / 1000, 'unixepoch', 'localtime') > datetime(${now}, 'localtime'))
    ), 1, 0)`.$castTo();
}
