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
exports.logger = exports.logManager = exports.format = exports.LogLevel = void 0;
exports.initialize = initialize;
const logger_1 = require("@notesnook/logger");
Object.defineProperty(exports, "LogLevel", { enumerable: true, get: function () { return logger_1.LogLevel; } });
Object.defineProperty(exports, "format", { enumerable: true, get: function () { return logger_1.format; } });
const index_js_1 = require("./database/index.js");
const array_js_1 = require("./utils/array.js");
const WEEK = 86400000 * 7;
class NNLogsMigrationProvider {
    getMigrations() {
        return __awaiter(this, void 0, void 0, function* () {
            return {
                "1": {
                    up(db) {
                        return __awaiter(this, void 0, void 0, function* () {
                            yield db.schema
                                .createTable("logs")
                                .addColumn("timestamp", "integer", (c) => c.notNull())
                                .addColumn("message", "text", (c) => c.notNull())
                                .addColumn("level", "integer", (c) => c.notNull())
                                .addColumn("date", "text")
                                .addColumn("scope", "text")
                                .addColumn("extras", "text")
                                .addColumn("elapsed", "integer")
                                .execute();
                            yield db.schema
                                .createIndex("log_timestamp_index")
                                .on("logs")
                                .column("timestamp")
                                .execute();
                        });
                    }
                }
            };
        });
    }
}
class DatabaseLogReporter {
    constructor(db) {
        this.writer = new DatabaseLogWriter(db);
    }
    write(log) {
        this.writer.push(log);
    }
}
class DatabaseLogWriter {
    constructor(db) {
        this.db = db;
        this.queue = [];
        this.hasCleared = false;
        setInterval(() => {
            setTimeout(() => {
                if (!this.hasCleared) {
                    this.hasCleared = true;
                    this.rotate();
                }
                this.flush();
            });
        }, process.env.NODE_ENV === "test" ? 200 : 10000);
    }
    push(message) {
        const date = new Date(message.timestamp);
        message.date = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
        this.queue.push(message);
    }
    flush() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.queue.length === 0)
                return;
            const queueCopy = this.queue.slice();
            this.queue = [];
            for (const chunk of (0, array_js_1.toChunks)(queueCopy, 1000)) {
                yield this.db.insertInto("logs").values(chunk).execute();
            }
        });
    }
    rotate() {
        return __awaiter(this, void 0, void 0, function* () {
            const range = Date.now() - WEEK;
            yield this.db.deleteFrom("logs").where("timestamp", "<", range).execute();
        });
    }
}
class DatabaseLogManager {
    constructor(db) {
        this.db = db;
    }
    get() {
        return __awaiter(this, void 0, void 0, function* () {
            const logs = yield this.db
                .selectFrom("logs")
                .select([
                "timestamp",
                "message",
                "level",
                "scope",
                "extras",
                "elapsed",
                "date"
            ])
                .execute();
            const groupedLogs = {};
            for (const log of logs) {
                const key = log.date;
                if (!groupedLogs[key])
                    groupedLogs[key] = [];
                groupedLogs[key].push(log);
            }
            return Object.keys(groupedLogs)
                .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
                .map((key) => {
                var _a;
                return ({
                    key,
                    logs: (_a = groupedLogs[key]) === null || _a === void 0 ? void 0 : _a.sort((a, b) => a.timestamp - b.timestamp)
                });
            });
        });
    }
    clear() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.db.deleteFrom("logs").execute();
        });
    }
    delete(key) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.db.deleteFrom("logs").where("date", "==", key).execute();
        });
    }
    close() {
        return this.db.destroy();
    }
}
function initialize(options, disableConsoleLogs) {
    return __awaiter(this, void 0, void 0, function* () {
        const db = yield (0, index_js_1.createDatabase)("notesnook-logs", Object.assign(Object.assign({}, options), { migrationProvider: new NNLogsMigrationProvider() }));
        const reporters = [new DatabaseLogReporter(db)];
        if (process.env.NODE_ENV !== "production" && !disableConsoleLogs)
            reporters.push(logger_1.consoleReporter);
        const instance = new logger_1.Logger({
            reporter: (0, logger_1.combineReporters)(reporters),
            lastTime: Date.now()
        });
        if (logger instanceof logger_1.NoopLogger)
            logger.replaceWith(instance);
        exports.logger = logger = instance;
        exports.logManager = logManager = new DatabaseLogManager(db);
    });
}
let logger = new logger_1.NoopLogger();
exports.logger = logger;
let logManager = undefined;
exports.logManager = logManager;
