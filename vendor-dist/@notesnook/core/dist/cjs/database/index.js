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
var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _SqliteBooleanPlugin_transformer;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SqliteBooleanPlugin = void 0;
exports.initializeDatabase = initializeDatabase;
exports.createDatabase = createDatabase;
exports.changeDatabasePassword = changeDatabasePassword;
exports.isFalse = isFalse;
const kysely_1 = require("@streetwriters/kysely");
const types_js_1 = require("../types.js");
const logger_js_1 = require("../logger.js");
const common_js_1 = require("../common.js");
// type ObjectFields = ValueOf<{
//   [D in keyof DatabaseSchema]: FilterBooleanProperties<
//     DatabaseSchema[D],
//     object | undefined | null
//   >;
// }>;
const BooleanProperties = new Set([
    "compressed",
    "deleted",
    "disabled",
    "favorite",
    "localOnly",
    "locked",
    "migrated",
    "pinned",
    "readonly",
    "remote",
    "synced",
    "isGeneratedTitle",
    "archived",
    "selfDestruct"
]);
const DataMappers = {
    note: (row) => {
        row.conflicted = row.conflicted === 1;
        if (row.expiryDate)
            row.expiryDate = JSON.parse(row.expiryDate);
    },
    reminder: (row) => {
        if (row.selectedDays)
            row.selectedDays = JSON.parse(row.selectedDays);
    },
    settingitem: (row) => {
        if (row.value &&
            (row.key.startsWith("groupOptions") ||
                row.key.startsWith("toolbarConfig") ||
                row.key.startsWith("sideBarOrder") ||
                row.key.startsWith("sideBarHiddenItems") ||
                row.key.startsWith("profile")))
            row.value = JSON.parse(row.value);
    },
    tiptap: (row) => {
        if (row.conflicted)
            row.conflicted = JSON.parse(row.conflicted);
        if (row.locked && row.data)
            row.data = JSON.parse(row.data);
    },
    sessioncontent: (row) => {
        if (row.locked && row.data)
            row.data = JSON.parse(row.data);
    },
    attachment: (row) => {
        if (row.key)
            row.key = JSON.parse(row.key);
    },
    vault: (row) => {
        if (row.key)
            row.key = JSON.parse(row.key);
    },
    monograph: (row) => {
        if (row.password)
            row.password = JSON.parse(row.password);
    },
    trash: (row) => {
        if (row.expiryDate)
            row.expiryDate = JSON.parse(row.expiryDate);
    }
};
function setupDatabase(db, options) {
    return __awaiter(this, void 0, void 0, function* () {
        if (options.password)
            yield (0, kysely_1.sql) `PRAGMA key = ${kysely_1.sql.ref(options.password)}`.execute(db);
        yield (0, kysely_1.sql) `PRAGMA journal_mode = ${kysely_1.sql.raw(options.journalMode || "WAL")}`.execute(db);
        yield (0, kysely_1.sql) `PRAGMA synchronous = ${kysely_1.sql.raw(options.synchronous || "normal")}`.execute(db);
        // recursive_triggers are required so that SQLite fires DELETE trigger on
        // REPLACE INTO statements
        yield (0, kysely_1.sql) `PRAGMA recursive_triggers = true`.execute(db);
        if (options.pageSize)
            yield (0, kysely_1.sql) `PRAGMA page_size = ${kysely_1.sql.raw(options.pageSize.toString())}`.execute(db);
        if (options.tempStore)
            yield (0, kysely_1.sql) `PRAGMA temp_store = ${kysely_1.sql.raw(options.tempStore)}`.execute(db);
        if (options.cacheSize)
            yield (0, kysely_1.sql) `PRAGMA cache_size = ${kysely_1.sql.raw(options.cacheSize.toString())}`.execute(db);
        if (options.lockingMode)
            yield (0, kysely_1.sql) `PRAGMA locking_mode = ${kysely_1.sql.raw(options.lockingMode)}`.execute(db);
    });
}
function initializeDatabase(db, migrationProvider, name) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const migrator = new kysely_1.Migrator({
                db,
                provider: migrationProvider
            });
            const needsMigration = yield migrator
                .getMigrations()
                .then((m) => m.some((m) => !m.executedAt));
            if (!needsMigration)
                return db;
            common_js_1.EV.publish(common_js_1.EVENTS.migrationStarted, name);
            const { error, results } = yield migrator.migrateToLatest();
            common_js_1.EV.publish(common_js_1.EVENTS.migrationFinished, name);
            if (error)
                throw error instanceof Error ? error : new Error(JSON.stringify(error));
            const errors = (results === null || results === void 0 ? void 0 : results.filter((it) => it.status === "Error")) || [];
            if (errors.length > 0)
                throw new Error(`failed to execute migrations: ${errors
                    .map((e) => e.migrationName)
                    .join(", ")}`);
            return db;
        }
        catch (e) {
            logger_js_1.logger.error(e, "Failed to initialized database.");
            yield db.destroy();
            throw e;
        }
    });
}
function createDatabase(name, options) {
    return __awaiter(this, void 0, void 0, function* () {
        const db = new kysely_1.Kysely({
            // log: (event) => {
            //   if (event.queryDurationMillis > 5)
            //     console.warn(event.query.sql, event.queryDurationMillis);
            // },
            dialect: options.dialect(name, () => __awaiter(this, void 0, void 0, function* () {
                yield db.connection().execute((db) => __awaiter(this, void 0, void 0, function* () {
                    yield setupDatabase(db, options);
                    yield initializeDatabase(db, options.migrationProvider, name);
                    if (options.onInit)
                        yield options.onInit(db);
                }));
            })),
            plugins: [new SqliteBooleanPlugin()]
        });
        if (!options.skipInitialization)
            yield db.connection().execute((db) => __awaiter(this, void 0, void 0, function* () {
                yield setupDatabase(db, options);
                yield initializeDatabase(db, options.migrationProvider, name);
                if (options.onInit)
                    yield options.onInit(db);
            }));
        return db;
    });
}
function changeDatabasePassword(db, password) {
    return __awaiter(this, void 0, void 0, function* () {
        yield (0, kysely_1.sql) `PRAGMA rekey = "${password ? password : ""}"`.execute(db);
    });
}
function isFalse(column) {
    return (eb) => eb.or([eb(column, "is", eb.lit(null)), eb(column, "==", eb.lit(0))]);
}
class SqliteBooleanPlugin {
    constructor() {
        _SqliteBooleanPlugin_transformer.set(this, new SqliteBooleanTransformer());
    }
    transformQuery(args) {
        return __classPrivateFieldGet(this, _SqliteBooleanPlugin_transformer, "f").transformNode(args.node);
    }
    transformResult(args) {
        for (let i = 0; i < args.result.rows.length; ++i) {
            const row = args.result.rows[i];
            if (typeof row !== "object")
                continue;
            if ((0, types_js_1.isDeleted)(row)) {
                args.result.rows[i] = {
                    deleted: true,
                    synced: row.synced,
                    dateModified: row.dateModified,
                    id: row.id
                };
                continue;
            }
            for (const key in row) {
                if (BooleanProperties.has(key)) {
                    row[key] = row[key] === 1;
                }
            }
            const mapper = !!row.type && DataMappers[row.type];
            if (mapper) {
                mapper(row);
            }
        }
        return Promise.resolve(args.result);
    }
}
exports.SqliteBooleanPlugin = SqliteBooleanPlugin;
_SqliteBooleanPlugin_transformer = new WeakMap();
class SqliteBooleanTransformer extends kysely_1.OperationNodeTransformer {
    transformValue(node) {
        return Object.assign(Object.assign({}, super.transformValue(node)), { value: this.serialize(node.value) });
    }
    transformPrimitiveValueList(node) {
        return Object.assign(Object.assign({}, super.transformPrimitiveValueList(node)), { values: node.values.map((value) => this.serialize(value)) });
    }
    serialize(value) {
        return typeof value === "boolean"
            ? value
                ? 1
                : 0
            : typeof value === "object" && value !== null
                ? JSON.stringify(value)
                : value;
    }
}
