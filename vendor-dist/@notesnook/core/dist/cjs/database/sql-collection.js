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
var __await = (this && this.__await) || function (v) { return this instanceof __await ? (this.v = v, this) : new __await(v); }
var __asyncGenerator = (this && this.__asyncGenerator) || function (thisArg, _arguments, generator) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var g = generator.apply(thisArg, _arguments || []), i, q = [];
    return i = Object.create((typeof AsyncIterator === "function" ? AsyncIterator : Object).prototype), verb("next"), verb("throw"), verb("return", awaitReturn), i[Symbol.asyncIterator] = function () { return this; }, i;
    function awaitReturn(f) { return function (v) { return Promise.resolve(v).then(f, reject); }; }
    function verb(n, f) { if (g[n]) { i[n] = function (v) { return new Promise(function (a, b) { q.push([n, v, a, b]) > 1 || resume(n, v); }); }; if (f) i[n] = f(i[n]); } }
    function resume(n, v) { try { step(g[n](v)); } catch (e) { settle(q[0][3], e); } }
    function step(r) { r.value instanceof __await ? Promise.resolve(r.value.v).then(fulfill, reject) : settle(q[0][2], r); }
    function fulfill(value) { resume("next", value); }
    function reject(value) { resume("throw", value); }
    function settle(f, v) { if (f(v), q.shift(), q.length) resume(q[0][0], q[0][1]); }
};
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FilteredSelector = exports.SQLCollection = exports.MAX_SQL_PARAMETERS = void 0;
const common_js_1 = require("../common.js");
const types_js_1 = require("../types.js");
const index_js_1 = require("./index.js");
const kysely_1 = require("@streetwriters/kysely");
const virtualized_grouping_js_1 = require("../utils/virtualized-grouping.js");
const grouping_js_1 = require("../utils/grouping.js");
const array_js_1 = require("../utils/array.js");
const reminders_js_1 = require("../collections/reminders.js");
const formats = {
    month: "%Y-%m",
    year: "%Y",
    week: "%Y-%W",
    abc: null,
    default: "%Y-%W",
    none: null
};
exports.MAX_SQL_PARAMETERS = 200;
class SQLCollection {
    constructor(db, _startTransaction, type, eventManager, sanitizer) {
        this.db = db;
        this.type = type;
        this.eventManager = eventManager;
        this.sanitizer = sanitizer;
    }
    clear() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.db().deleteFrom(this.type).execute();
        });
    }
    init() {
        return __awaiter(this, void 0, void 0, function* () { });
    }
    upsert(item) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!item.id)
                throw new Error("The item must contain the id field.");
            if (!item.deleted)
                item.dateCreated = item.dateCreated || Date.now();
            // if item is newly synced, remote will be true.
            if (!item.remote) {
                item.dateModified = Date.now();
                item.synced = false;
            }
            // the item has become local now, so remove the flags
            delete item.remote;
            if (!this.sanitizer.sanitize(this.type, item))
                return;
            yield this.db()
                .replaceInto(this.type)
                .values(item)
                .execute();
            this.eventManager.publish(common_js_1.EVENTS.databaseUpdated, {
                type: "upsert",
                collection: this.type,
                item
            });
        });
    }
    softDelete(ids) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.db()
                .transaction()
                .execute((tx) => __awaiter(this, void 0, void 0, function* () {
                for (const chunk of (0, array_js_1.toChunks)(ids, exports.MAX_SQL_PARAMETERS)) {
                    yield tx
                        .replaceInto(this.type)
                        .values(chunk.map((id) => ({
                        id,
                        deleted: true,
                        dateModified: Date.now(),
                        synced: false
                    })))
                        .execute();
                }
            }));
            this.eventManager.publish(common_js_1.EVENTS.databaseUpdated, {
                type: "softDelete",
                collection: this.type,
                ids
            });
        });
    }
    delete(ids) {
        return __awaiter(this, void 0, void 0, function* () {
            if (ids.length <= 0)
                return;
            yield this.db()
                .transaction()
                .execute((tx) => __awaiter(this, void 0, void 0, function* () {
                for (const chunk of (0, array_js_1.toChunks)(ids, exports.MAX_SQL_PARAMETERS)) {
                    yield tx
                        .deleteFrom(this.type)
                        .where("id", "in", chunk)
                        .execute();
                }
            }));
            this.eventManager.publish(common_js_1.EVENTS.databaseUpdated, {
                type: "delete",
                collection: this.type,
                ids
            });
        });
    }
    exists(id) {
        return __awaiter(this, void 0, void 0, function* () {
            const { count } = (yield this.db()
                .selectFrom(this.type)
                .select((a) => a.fn.count("id").as("count"))
                .where("id", "==", id)
                .where((0, index_js_1.isFalse)("deleted"))
                .limit(1)
                .executeTakeFirst()) || {};
            return count !== undefined && count > 0;
        });
    }
    count() {
        return __awaiter(this, void 0, void 0, function* () {
            const { count } = (yield this.db()
                .selectFrom(this.type)
                .select((a) => a.fn.count("id").as("count"))
                .where((0, index_js_1.isFalse)("deleted"))
                .executeTakeFirst()) || {};
            return count || 0;
        });
    }
    get(id) {
        return __awaiter(this, void 0, void 0, function* () {
            const item = yield this.db()
                .selectFrom(this.type)
                .selectAll()
                .where("id", "==", id)
                .executeTakeFirst();
            if (!item || (0, types_js_1.isDeleted)(item))
                return;
            return item;
        });
    }
    put(items) {
        return __awaiter(this, void 0, void 0, function* () {
            if (items.length <= 0)
                return [];
            const entries = items.reduce((array, item) => {
                if (!item)
                    return array;
                if (!item.remote) {
                    // NOTE: this is intentional
                    // When we are bulk adding items, we shouldn't touch the dateModified
                    // item.dateModified = Date.now();
                    item.synced = false;
                }
                delete item.remote;
                if (!this.sanitizer.sanitize(this.type, item))
                    return array;
                array.push(item);
                return array;
            }, []);
            if (entries.length <= 0)
                return [];
            yield this.db()
                .transaction()
                .execute((tx) => __awaiter(this, void 0, void 0, function* () {
                for (const chunk of (0, array_js_1.toChunks)(entries, exports.MAX_SQL_PARAMETERS)) {
                    yield tx
                        .replaceInto(this.type)
                        .values(chunk)
                        .execute();
                }
            }));
            return entries;
        });
    }
    update(ids_1, partial_1) {
        return __awaiter(this, arguments, void 0, function* (ids, partial, options = {}) {
            const { sendEvent = true, modify = true, condition } = options;
            if (!this.sanitizer.sanitize(this.type, partial))
                return;
            yield this.db()
                .transaction()
                .execute((tx) => __awaiter(this, void 0, void 0, function* () {
                for (const chunk of (0, array_js_1.toChunks)(ids, exports.MAX_SQL_PARAMETERS)) {
                    yield tx
                        .updateTable(this.type)
                        .where("id", "in", chunk)
                        .$if(!!condition, (eb) => eb.where(condition))
                        .set(Object.assign(Object.assign({}, partial), { dateModified: modify ? Date.now() : undefined, synced: partial.synced || false }))
                        .execute();
                }
            }));
            if (sendEvent) {
                this.eventManager.publish(common_js_1.EVENTS.databaseUpdated, {
                    type: "update",
                    collection: this.type,
                    ids,
                    item: partial
                });
            }
        });
    }
    records(ids) {
        return __awaiter(this, void 0, void 0, function* () {
            const results = yield this.db()
                .selectFrom(this.type)
                .selectAll()
                .$if(ids.length > 0, (eb) => eb.where("id", "in", ids))
                .execute();
            const items = {};
            for (const item of results) {
                items[item.id] = item;
            }
            return items;
        });
    }
    unsyncedCount() {
        return __awaiter(this, void 0, void 0, function* () {
            const { count } = (yield this.db()
                .selectFrom(this.type)
                .select((a) => a.fn.count("id").as("count"))
                .where((0, index_js_1.isFalse)("synced"))
                .$if(this.type === "content", (eb) => eb.where("conflicted", "is", null))
                .$if(this.type === "notes", (eb) => eb.where("conflicted", "is not", true))
                .$if(this.type === "attachments", (eb) => eb.where((eb) => eb.or([eb("dateUploaded", ">", 0), eb("deleted", "==", true)])))
                .executeTakeFirst()) || {};
            return count || 0;
        });
    }
    unsynced(chunkSize, forceSync) {
        return __asyncGenerator(this, arguments, function* unsynced_1() {
            let lastRowId = null;
            while (true) {
                const rows = (yield __await(this.db()
                    .selectFrom(this.type)
                    .selectAll()
                    .$if(lastRowId != null, (qb) => qb.where("id", ">", lastRowId))
                    .$if(!forceSync, (eb) => eb.where((0, index_js_1.isFalse)("synced")))
                    .$if(this.type === "content", (eb) => eb.where("conflicted", "is", null))
                    .$if(this.type === "notes", (eb) => eb.where("conflicted", "is not", true))
                    .$if(this.type === "attachments", (eb) => eb.where((eb) => eb.or([eb("dateUploaded", ">", 0), eb("deleted", "==", true)])))
                    .orderBy("id")
                    .limit(chunkSize)
                    .execute()));
                if (rows.length === 0)
                    break;
                yield yield __await(rows);
                lastRowId = rows[rows.length - 1].id;
            }
        });
    }
    stream(chunkSize) {
        return __asyncGenerator(this, arguments, function* stream_1() {
            let lastRow = null;
            while (true) {
                const rows = (yield __await(this.db()
                    .selectFrom(this.type)
                    .where((0, index_js_1.isFalse)("deleted"))
                    .orderBy("dateCreated asc")
                    .orderBy("id asc")
                    .$if(lastRow !== null, (qb) => qb.where((eb) => eb.refTuple("dateCreated", "id"), ">", (eb) => eb.tuple(lastRow.dateCreated, lastRow.id)))
                    .selectAll()
                    .limit(chunkSize)
                    .execute()));
                if (rows.length === 0)
                    break;
                for (const row of rows) {
                    yield yield __await(row);
                }
                lastRow = rows[rows.length - 1];
            }
        });
    }
    createFilter(selector, batchSize) {
        return new FilteredSelector(this.type, this.db().selectFrom(this.type).$call(selector), batchSize);
    }
}
exports.SQLCollection = SQLCollection;
class FilteredSelector {
    constructor(type, filter, batchSize = 500) {
        this.type = type;
        this.batchSize = batchSize;
        this._fields = [];
        this._limit = 0;
        this.filter = filter;
    }
    fields(fields) {
        this._fields = fields;
        return this;
    }
    limit(limit) {
        this._limit = limit;
        return this;
    }
    ids(sortOptions) {
        return __awaiter(this, void 0, void 0, function* () {
            return (yield this.filter
                .$if(!!sortOptions, (eb) => eb.$call(this.buildSortExpression(Object.assign(Object.assign({}, sortOptions), { groupBy: "none" }))))
                .select("id")
                .execute()).map((i) => i.id);
        });
    }
    items(ids, sortOptions) {
        return __awaiter(this, void 0, void 0, function* () {
            if (ids && !(ids === null || ids === void 0 ? void 0 : ids.length))
                return [];
            return (yield this.filter
                .$if(!!ids && ids.length > 0, (eb) => eb.where("id", "in", ids))
                .$if(!!sortOptions, (eb) => eb.$call(this.buildSortExpression(Object.assign(Object.assign({}, sortOptions), { groupBy: "none" }))))
                .$if(this._fields.length === 0, (eb) => eb.selectAll())
                .$if(this._fields.length > 0, (eb) => eb.select(this._fields))
                .$if(!!this._limit, (eb) => eb.limit(this._limit))
                .execute());
        });
    }
    records(ids, sortOptions) {
        return __awaiter(this, void 0, void 0, function* () {
            if (ids && !(ids === null || ids === void 0 ? void 0 : ids.length))
                return {};
            const results = yield this.items(ids, sortOptions);
            const items = {};
            for (const item of results) {
                items[item.id] = item;
            }
            if (ids)
                return Object.fromEntries(ids.map((id) => [id, items[id]]));
            return items;
        });
    }
    has(id) {
        return __awaiter(this, void 0, void 0, function* () {
            const { count } = (yield this.filter
                .where("id", "==", id)
                .limit(1)
                .select((a) => a.fn.count("id").as("count"))
                .executeTakeFirst()) || {};
            return count !== undefined && count > 0;
        });
    }
    count() {
        return __awaiter(this, void 0, void 0, function* () {
            const { count } = (yield this.filter
                .select((a) => a.fn.count("id").as("count"))
                .executeTakeFirst()) || {};
            return count || 0;
        });
    }
    find(filter) {
        return __awaiter(this, void 0, void 0, function* () {
            const item = yield this.filter
                .where(filter)
                .limit(1)
                .$if(this._fields.length === 0, (eb) => eb.selectAll())
                .$if(this._fields.length > 0, (eb) => eb.select(this._fields))
                .executeTakeFirst();
            return item;
        });
    }
    where(expr) {
        this.filter = this.filter.where(expr);
        return this;
    }
    map(fn) {
        return __asyncGenerator(this, arguments, function* map_1() {
            var _a, e_1, _b, _c;
            try {
                for (var _d = true, _e = __asyncValues(this.iterate()), _f; _f = yield __await(_e.next()), _a = _f.done, !_a; _d = true) {
                    _c = _f.value;
                    _d = false;
                    const item = _c;
                    yield yield __await(fn(item));
                }
            }
            catch (e_1_1) { e_1 = { error: e_1_1 }; }
            finally {
                try {
                    if (!_d && !_a && (_b = _e.return)) yield __await(_b.call(_e));
                }
                finally { if (e_1) throw e_1.error; }
            }
        });
    }
    grouped(options) {
        return __awaiter(this, void 0, void 0, function* () {
            sanitizeSortOptions(this.type, options);
            const count = yield this.count();
            return new virtualized_grouping_js_1.VirtualizedGrouping(count, this.batchSize, () => this.ids(options), (start, end) => __awaiter(this, void 0, void 0, function* () {
                const items = (yield this.filter
                    .$call(this.buildSortExpression(options))
                    .offset(start)
                    .limit(end - start)
                    .selectAll()
                    .execute());
                return {
                    ids: items.map((i) => i.id),
                    items
                };
            }), (items) => (0, grouping_js_1.groupArray)(items, (0, grouping_js_1.createKeySelector)(options)), () => this.groups(options));
        });
    }
    groups(options) {
        return __awaiter(this, void 0, void 0, function* () {
            sanitizeSortOptions(this.type, options);
            const fields = ["id", "type"];
            if (this.type === "notes")
                fields.push("notes.pinned", "notes.conflicted");
            else if (this.type === "notebooks")
                fields.push("notebooks.pinned");
            else if (this.type === "attachments" && options.groupBy === "abc")
                fields.push("attachments.filename");
            else if (this.type === "reminders" || options.sortBy === "dueDate") {
                fields.push("reminders.mode", "reminders.snoozeUntil", "reminders.disabled", "reminders.date", (0, reminders_js_1.createUpcomingReminderTimeQuery)().as("dueDate"));
            }
            if (options.groupBy === "abc")
                fields.push("title");
            else if (options.sortBy === "title" && options.groupBy !== "none")
                fields.push("dateCreated");
            else if (options.sortBy !== "dueDate" && options.sortBy !== "relevance")
                fields.push(options.sortBy);
            return Array.from((0, grouping_js_1.groupArray)(yield this.filter
                .select(fields)
                .$call(this.buildSortExpression(options, true))
                .execute(), (0, grouping_js_1.createKeySelector)(options)).values());
        });
    }
    sorted(options) {
        return __awaiter(this, void 0, void 0, function* () {
            const count = yield this.count();
            return new virtualized_grouping_js_1.VirtualizedGrouping(count, this.batchSize, () => this.ids(options), (start, end) => __awaiter(this, void 0, void 0, function* () {
                const items = (yield this.filter
                    .$call(this.buildSortExpression(Object.assign(Object.assign({}, options), { groupBy: "none" })))
                    .offset(start)
                    .limit(end - start)
                    .selectAll()
                    .execute());
                return {
                    ids: items.map((i) => i.id),
                    items
                };
            }));
        });
    }
    iterate() {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const thisArg = this;
        return {
            [Symbol.asyncIterator]() {
                return __asyncGenerator(this, arguments, function* _a() {
                    let lastRow = null;
                    const fields = thisArg._fields.slice();
                    if (fields.length > 0) {
                        if (!fields.find((f) => f.includes(".dateCreated")))
                            fields.push("dateCreated");
                        if (!fields.find((f) => f.includes(".id")))
                            fields.push("id");
                    }
                    while (true) {
                        const rows = yield __await(thisArg.filter
                            .orderBy("dateCreated asc")
                            .orderBy("id asc")
                            .$if(lastRow !== null, (qb) => qb.where((eb) => eb.refTuple("dateCreated", "id"), ">", (eb) => eb.tuple(lastRow.dateCreated, lastRow.id)))
                            .limit(thisArg.batchSize)
                            .$if(fields.length === 0, (eb) => eb.selectAll())
                            .$if(fields.length > 0, (eb) => eb.select(fields))
                            .execute());
                        if (rows.length === 0)
                            break;
                        for (const row of rows) {
                            yield yield __await(row);
                        }
                        lastRow = rows[rows.length - 1];
                    }
                });
            }
        };
    }
    buildSortExpression(options, hasDueDate) {
        sanitizeSortOptions(this.type, options);
        const sortBy = new Set();
        sortBy.add(options.sortBy);
        if (options.groupBy === "abc")
            sortBy.add("title");
        else if (options.sortBy === "title" && options.groupBy !== "none")
            sortBy.add("dateCreated");
        return (qb) => {
            if (this.type === "notes")
                qb = qb.orderBy((0, kysely_1.sql) `IFNULL(conflicted, 0) desc`);
            if (this.type === "notes" || this.type === "notebooks")
                qb = qb.orderBy((0, kysely_1.sql) `IFNULL(pinned, 0) desc`);
            if (this.type === "reminders")
                qb = qb.orderBy((qb) => qb.parens((0, reminders_js_1.createIsReminderActiveQuery)()), "desc");
            for (const item of sortBy) {
                if (item === "title") {
                    qb = qb.orderBy(options.sortBy !== "title"
                        ? (0, kysely_1.sql) `substring(ltrim(title, ' \u00a0\r\n\t\v'), 1, 1) COLLATE NOCASE`
                        : (0, kysely_1.sql) `ltrim(title, ' \u00a0\r\n\t\v') COLLATE NOCASE`, options.sortDirection);
                }
                else {
                    const timeFormat = isGroupOptions(options)
                        ? formats[options.groupBy]
                        : null;
                    if (!timeFormat || isSortByDate(options)) {
                        if (item === "dueDate") {
                            if (hasDueDate)
                                qb = qb.orderBy(item, options.sortDirection);
                            else
                                qb = qb.orderBy((qb) => qb.parens((0, reminders_js_1.createUpcomingReminderTimeQuery)()), options.sortDirection);
                        }
                        else if (item !== "relevance")
                            qb = qb.orderBy(item, options.sortDirection);
                        continue;
                    }
                    qb = qb.orderBy((0, kysely_1.sql) `strftime('${kysely_1.sql.raw(timeFormat)}', ${kysely_1.sql.raw(item)} / 1000, 'unixepoch', 'localtime')`, options.sortDirection);
                }
            }
            return qb;
        };
    }
}
exports.FilteredSelector = FilteredSelector;
function isGroupOptions(options) {
    return "groupBy" in options;
}
function isSortByDate(options) {
    return (options.sortBy === "dateCreated" ||
        options.sortBy === "dateEdited" ||
        options.sortBy === "dateDeleted" ||
        options.sortBy === "dateModified" ||
        options.sortBy === "dateUploaded" ||
        options.sortBy === "dueDate");
}
const BASE_FIELDS = ["dateCreated", "dateModified"];
const VALID_SORT_OPTIONS = {
    reminders: ["dueDate", "title"],
    tags: ["title"],
    attachments: ["filename", "dateUploaded", "size"],
    colors: ["title"],
    notebooks: ["title", "dateDeleted", "dateEdited"],
    notes: ["title", "dateDeleted", "dateEdited"],
    content: [],
    notehistory: [],
    relations: [],
    sessioncontent: [],
    settings: [],
    shortcuts: [],
    vaults: [],
    monographs: [],
    inboxitemshistory: []
};
function sanitizeSortOptions(type, options) {
    const validFields = [...VALID_SORT_OPTIONS[type], ...BASE_FIELDS];
    if (!validFields.includes(options.sortBy))
        options.sortBy = validFields[0];
    return options;
}
