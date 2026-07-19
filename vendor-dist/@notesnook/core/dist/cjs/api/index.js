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
const notes_js_1 = require("../collections/notes.js");
const crypto_js_1 = require("../utils/crypto.js");
const fs_js_1 = require("../database/fs.js");
const notebooks_js_1 = require("../collections/notebooks.js");
const trash_js_1 = __importDefault(require("../collections/trash.js"));
const index_js_1 = __importDefault(require("./sync/index.js"));
const tags_js_1 = require("../collections/tags.js");
const colors_js_1 = require("../collections/colors.js");
const vault_js_1 = __importDefault(require("./vault.js"));
const lookup_js_1 = __importDefault(require("./lookup.js"));
const content_js_1 = require("../collections/content.js");
const backup_js_1 = __importDefault(require("../database/backup.js"));
const constants_js_1 = __importDefault(require("../utils/constants.js"));
const common_js_1 = require("../common.js");
const legacy_settings_js_1 = require("../collections/legacy-settings.js");
const migrations_js_1 = __importDefault(require("./migrations.js"));
const user_manager_js_1 = __importDefault(require("./user-manager.js"));
const http_js_1 = __importDefault(require("../utils/http.js"));
const monographs_js_1 = require("./monographs.js");
const monographs_js_2 = require("../collections/monographs.js");
const offers_js_1 = require("./offers.js");
const attachments_js_1 = require("../collections/attachments.js");
const debug_js_1 = require("./debug.js");
const async_mutex_1 = require("async-mutex");
const note_history_js_1 = require("../collections/note-history.js");
const mfa_manager_js_1 = __importDefault(require("./mfa-manager.js"));
const event_manager_js_1 = __importDefault(require("../utils/event-manager.js"));
const pricing_js_1 = require("./pricing.js");
const logger_js_1 = require("../logger.js");
const shortcuts_js_1 = require("../collections/shortcuts.js");
const reminders_js_1 = require("../collections/reminders.js");
const relations_js_1 = require("../collections/relations.js");
const subscriptions_js_1 = __importDefault(require("./subscriptions.js"));
const inbox_items_history_js_1 = require("../collections/inbox-items-history.js");
const token_manager_js_1 = __importDefault(require("./token-manager.js"));
const settings_js_1 = require("../collections/settings.js");
const index_js_2 = require("../database/index.js");
const kysely_1 = require("@streetwriters/kysely");
const cached_collection_js_1 = require("../database/cached-collection.js");
const vaults_js_1 = require("../collections/vaults.js");
const kv_js_1 = require("../database/kv.js");
const sanitizer_js_1 = require("../database/sanitizer.js");
const triggers_js_1 = require("../database/triggers.js");
const migrations_js_2 = require("../database/migrations.js");
const config_js_1 = require("../database/config.js");
const lazy_promise_js_1 = require("../utils/lazy-promise.js");
const inbox_api_keys_js_1 = require("./inbox-api-keys.js");
const circle_js_1 = require("./circle.js");
const wrapped_js_1 = require("./wrapped.js");
// const DIFFERENCE_THRESHOLD = 20 * 1000;
// const MAX_TIME_ERROR_FAILURES = 5;
class Database {
    constructor() {
        this.isInitialized = false;
        this.eventManager = new event_manager_js_1.default();
        this.sseMutex = new async_mutex_1.Mutex();
        this.databaseReady = new lazy_promise_js_1.LazyPromise();
        this.storage = () => {
            var _a;
            if (!((_a = this.options) === null || _a === void 0 ? void 0 : _a.storage))
                throw new Error("Database not initialized. Did you forget to call db.setup()?");
            return this.options.storage;
        };
        this.fs = () => {
            var _a;
            if (!((_a = this.options) === null || _a === void 0 ? void 0 : _a.fs))
                throw new Error("Database not initialized. Did you forget to call db.setup()?");
            return (this._fs ||
                (this._fs = new fs_js_1.FileStorage(this.options.fs, this.tokenManager, this.eventManager)));
        };
        this.crypto = () => {
            if (!this.options)
                throw new Error("Database not initialized. Did you forget to call db.setup()?");
            return new crypto_js_1.Crypto(this.storage);
        };
        this.compressor = () => {
            var _a;
            if (!((_a = this.options) === null || _a === void 0 ? void 0 : _a.compressor))
                throw new Error("Database not initialized. Did you forget to call db.setup()?");
            return this._compressor || (this._compressor = this.options.compressor());
        };
        this.sql = () => {
            // if (this._transaction) return this._transaction.value;
            if (!this._sql)
                throw new Error("Database not initialized. Did you forget to call db.init()?");
            return this._sql;
        };
        this._kv = new kv_js_1.KVStorage(this.databaseReady.promise);
        this.kv = () => this._kv;
        this._config = new config_js_1.ConfigStorage(this.databaseReady.promise);
        this.config = () => this._config;
        this.transaction = (executor) => __awaiter(this, void 0, void 0, function* () {
            yield executor(this.sql());
            // if (this._transaction) {
            //   await executor(this._transaction.use()).finally(() =>
            //     this._transaction?.discard()
            //   );
            //   return;
            // }
            // return this.sql()
            //   .transaction()
            //   .execute(async (tr) => {
            //     this._transaction = new QueueValue(
            //       tr,
            //       () => (this._transaction = undefined)
            //     );
            //     await executor(this._transaction.use());
            //   })
            //   .finally(() => this._transaction?.discard());
        });
        this.tokenManager = new token_manager_js_1.default(this.kv, this.eventManager);
        this.mfa = new mfa_manager_js_1.default(this.tokenManager);
        this.subscriptions = new subscriptions_js_1.default(this);
        this.circle = new circle_js_1.Circle(this);
        this.offers = offers_js_1.Offers;
        this.debug = new debug_js_1.Debug();
        this.pricing = pricing_js_1.Pricing;
        this.user = new user_manager_js_1.default(this);
        this.syncer = new index_js_1.default(this);
        this.vault = new vault_js_1.default(this);
        this.lookup = new lookup_js_1.default(this);
        this.backup = new backup_js_1.default(this);
        this.migrations = new migrations_js_1.default(this);
        this.monographs = new monographs_js_1.Monographs(this);
        this.trash = new trash_js_1.default(this);
        this.sanitizer = new sanitizer_js_1.Sanitizer(this.sql);
        this.monographsCollection = new monographs_js_2.Monographs(this);
        this.notebooks = new notebooks_js_1.Notebooks(this);
        this.tags = new tags_js_1.Tags(this);
        this.colors = new colors_js_1.Colors(this);
        this.content = new content_js_1.Content(this);
        this.attachments = new attachments_js_1.Attachments(this);
        this.noteHistory = new note_history_js_1.NoteHistory(this);
        this.shortcuts = new shortcuts_js_1.Shortcuts(this);
        this.reminders = new reminders_js_1.Reminders(this);
        this.relations = new relations_js_1.Relations(this);
        this.notes = new notes_js_1.Notes(this);
        this.vaults = new vaults_js_1.Vaults(this);
        this.settings = new settings_js_1.Settings(this);
        this.inboxApiKeys = new inbox_api_keys_js_1.InboxApiKeys(this, this.tokenManager);
        this.inboxItemsHistory = new inbox_items_history_js_1.InboxItemsHistory(this);
        this.wrapped = new wrapped_js_1.Wrapped(this);
        /**
         * @deprecated only kept here for migration purposes
         */
        this.legacyTags = new cached_collection_js_1.CachedCollection(this.storage, "tags");
        /**
         * @deprecated only kept here for migration purposes
         */
        this.legacyColors = new cached_collection_js_1.CachedCollection(this.storage, "colors");
        /**
         * @deprecated only kept here for migration purposes
         */
        this.legacyNotes = new cached_collection_js_1.CachedCollection(this.storage, "notes");
        /**
         * @deprecated only kept here for migration purposes
         */
        this.legacySettings = new legacy_settings_js_1.LegacySettings(this);
    }
    // constructor() {
    //   this.sseMutex = new Mutex();
    //   // this.lastHeartbeat = undefined; // { local: 0, server: 0 };
    //   // this.timeErrorFailures = 0;
    // }
    setup(options) {
        this.options = options;
    }
    reset() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.storage().clear();
            yield (0, triggers_js_1.dropTriggers)(this.sql());
            for (const statement of [
                "PRAGMA writable_schema = 1",
                "DELETE FROM sqlite_master",
                "PRAGMA writable_schema = 0",
                "VACUUM",
                "PRAGMA integrity_check"
            ]) {
                yield kysely_1.sql.raw(statement).execute(this.sql());
            }
            yield (0, index_js_2.initializeDatabase)(this.sql().withTables(), new migrations_js_2.NNMigrationProvider(), "notesnook");
            yield this.onInit(this.sql());
            yield this.initCollections();
            return true;
        });
    }
    changePassword(password) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this._sql)
                return;
            yield (0, index_js_2.changeDatabasePassword)(this._sql, password);
        });
    }
    init() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.options)
                throw new Error("options not specified. Did you forget to call db.setup()?");
            this.eventManager.subscribeMulti([common_js_1.EVENTS.userLoggedIn, common_js_1.EVENTS.userFetched], this.connectSSE, this);
            this.eventManager.subscribe(common_js_1.EVENTS.tokenRefreshed, () => this.connectSSE());
            this.eventManager.subscribe(common_js_1.EVENTS.attachmentDeleted, (attachment) => __awaiter(this, void 0, void 0, function* () {
                yield this.fs().cancel(attachment.hash);
            }));
            this.eventManager.subscribe(common_js_1.EVENTS.userLoggedOut, () => __awaiter(this, void 0, void 0, function* () {
                yield this.monographs.clear();
                yield this.fs().clear();
                this.disconnectSSE();
            }));
            this._sql = (yield (0, index_js_2.createDatabase)("notesnook", Object.assign(Object.assign({}, this.options.sqliteOptions), { migrationProvider: new migrations_js_2.NNMigrationProvider(), onInit: (db) => this.onInit(db) })));
            this.databaseReady.resolve(this._sql);
            yield this.sanitizer.init();
            yield this.initCollections();
            yield this.migrations.init();
            this.isInitialized = true;
            if (this.migrations.required()) {
                logger_js_1.logger.warn("Database migration is required.");
            }
        });
    }
    onInit(db) {
        return __awaiter(this, void 0, void 0, function* () {
            yield (0, triggers_js_1.createTriggers)(db);
        });
    }
    initCollections() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.legacySettings.init();
            // collections
            yield this.settings.init();
            yield this.notebooks.init();
            yield this.tags.init();
            yield this.colors.init();
            yield this.content.init();
            yield this.attachments.init();
            yield this.noteHistory.init();
            yield this.shortcuts.init();
            yield this.reminders.init();
            yield this.relations.init();
            yield this.notes.init();
            yield this.vaults.init();
            yield this.monographsCollection.init();
            yield this.inboxItemsHistory.init();
            yield this.trash.init();
            // legacy collections
            yield this.legacyTags.init();
            yield this.legacyColors.init();
            yield this.legacyNotes.init();
            // we must not wait on network requests that's why
            // no await
            this.monographs.refresh().catch(logger_js_1.logger.error);
        });
    }
    disconnectSSE() {
        if (!this.eventSource)
            return;
        this.eventSource.onopen = null;
        this.eventSource.onmessage = null;
        this.eventSource.onerror = null;
        this.eventSource.close();
        this.eventSource = null;
    }
    /**
     *
     * @param {{force: boolean, error: any}} args
     */
    connectSSE(args) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.sseMutex.runExclusive(() => __awaiter(this, void 0, void 0, function* () {
                const forceReconnect = args && args.force;
                const EventSource = this.options.eventsource;
                if (!EventSource ||
                    (!forceReconnect &&
                        this.eventSource &&
                        this.eventSource.readyState === this.eventSource.OPEN))
                    return;
                this.disconnectSSE();
                const token = yield this.tokenManager.getAccessToken();
                if (!token)
                    return;
                this.eventSource = new EventSource(`${constants_js_1.default.SSE_HOST}/sse`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                this.eventSource.onopen = () => __awaiter(this, void 0, void 0, function* () {
                    logger_js_1.logger.log("SSE: opened channel successfully!");
                });
                this.eventSource.onerror = function (error) {
                    logger_js_1.logger.error(error, "SSE: error");
                };
                this.eventSource.onmessage = (event) => __awaiter(this, void 0, void 0, function* () {
                    try {
                        const message = JSON.parse(event.data);
                        const data = JSON.parse(message.data);
                        switch (message.type) {
                            case "upgrade": {
                                const user = yield this.user.getUser();
                                if (!user)
                                    break;
                                user.subscription = data;
                                yield this.user.setUser(user);
                                this.eventManager.publish(common_js_1.EVENTS.userSubscriptionUpdated, data);
                                yield this.tokenManager._refreshToken(true);
                                break;
                            }
                            case "logout": {
                                yield this.user.logout(true, data.reason || "Unknown.");
                                break;
                            }
                            case "emailConfirmed": {
                                yield this.tokenManager._refreshToken(true);
                                yield this.user.fetchUser();
                                this.eventManager.publish(common_js_1.EVENTS.userEmailConfirmed);
                                break;
                            }
                            case "triggerSync": {
                                this.eventManager.publish(common_js_1.EVENTS.databaseSyncRequested, true, false);
                                break;
                            }
                            case "inboxUpdated": {
                                yield this.user.fetchUser();
                                break;
                            }
                        }
                    }
                    catch (e) {
                        logger_js_1.logger.error("SSE: Unsupported message. Message = ", event.data);
                        return;
                    }
                });
            }));
        });
    }
    lastSynced() {
        return __awaiter(this, void 0, void 0, function* () {
            return (yield this.kv().read("lastSynced")) || 0;
        });
    }
    setLastSynced(lastSynced) {
        return this.kv().write("lastSynced", lastSynced);
    }
    sync(options) {
        return this.syncer.start(options);
    }
    hasUnsyncedChanges() {
        return this.syncer.sync.collector.hasUnsyncedChanges();
    }
    host(hosts) {
        constants_js_1.default.AUTH_HOST = hosts.AUTH_HOST || constants_js_1.default.AUTH_HOST;
        constants_js_1.default.API_HOST = hosts.API_HOST || constants_js_1.default.API_HOST;
        constants_js_1.default.SSE_HOST = hosts.SSE_HOST || constants_js_1.default.SSE_HOST;
        constants_js_1.default.SUBSCRIPTIONS_HOST =
            hosts.SUBSCRIPTIONS_HOST || constants_js_1.default.SUBSCRIPTIONS_HOST;
        constants_js_1.default.ISSUES_HOST = hosts.ISSUES_HOST || constants_js_1.default.ISSUES_HOST;
        constants_js_1.default.MONOGRAPH_HOST = hosts.MONOGRAPH_HOST || constants_js_1.default.MONOGRAPH_HOST;
        constants_js_1.default.NOTESNOOK_HOST = hosts.NOTESNOOK_HOST || constants_js_1.default.NOTESNOOK_HOST;
    }
    version() {
        return http_js_1.default.get(`${constants_js_1.default.API_HOST}/version`);
    }
    announcements() {
        return __awaiter(this, void 0, void 0, function* () {
            let url = `${constants_js_1.default.API_HOST}/announcements/active`;
            const user = yield this.user.getUser();
            if (user)
                url += `?userId=${user.id}`;
            return http_js_1.default.get(url);
        });
    }
}
exports.default = Database;
