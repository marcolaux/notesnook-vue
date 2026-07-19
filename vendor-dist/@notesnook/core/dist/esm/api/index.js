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
import { Notes } from "../collections/notes.js";
import { Crypto } from "../utils/crypto.js";
import { FileStorage } from "../database/fs.js";
import { Notebooks } from "../collections/notebooks.js";
import Trash from "../collections/trash.js";
import Sync from "./sync/index.js";
import { Tags } from "../collections/tags.js";
import { Colors } from "../collections/colors.js";
import Vault from "./vault.js";
import Lookup from "./lookup.js";
import { Content } from "../collections/content.js";
import Backup from "../database/backup.js";
import Hosts from "../utils/constants.js";
import { EVENTS } from "../common.js";
import { LegacySettings } from "../collections/legacy-settings.js";
import Migrations from "./migrations.js";
import UserManager from "./user-manager.js";
import http from "../utils/http.js";
import { Monographs } from "./monographs.js";
import { Monographs as MonographsCollection } from "../collections/monographs.js";
import { Offers } from "./offers.js";
import { Attachments } from "../collections/attachments.js";
import { Debug } from "./debug.js";
import { Mutex } from "async-mutex";
import { NoteHistory } from "../collections/note-history.js";
import MFAManager from "./mfa-manager.js";
import EventManager from "../utils/event-manager.js";
import { Pricing } from "./pricing.js";
import { logger } from "../logger.js";
import { Shortcuts } from "../collections/shortcuts.js";
import { Reminders } from "../collections/reminders.js";
import { Relations } from "../collections/relations.js";
import Subscriptions from "./subscriptions.js";
import { InboxItemsHistory } from "../collections/inbox-items-history.js";
import TokenManager from "./token-manager.js";
import { Settings } from "../collections/settings.js";
import { changeDatabasePassword, createDatabase, initializeDatabase } from "../database/index.js";
import { sql } from "@streetwriters/kysely";
import { CachedCollection } from "../database/cached-collection.js";
import { Vaults } from "../collections/vaults.js";
import { KVStorage } from "../database/kv.js";
import { Sanitizer } from "../database/sanitizer.js";
import { createTriggers, dropTriggers } from "../database/triggers.js";
import { NNMigrationProvider } from "../database/migrations.js";
import { ConfigStorage } from "../database/config.js";
import { LazyPromise } from "../utils/lazy-promise.js";
import { InboxApiKeys } from "./inbox-api-keys.js";
import { Circle } from "./circle.js";
import { Wrapped } from "./wrapped.js";
// const DIFFERENCE_THRESHOLD = 20 * 1000;
// const MAX_TIME_ERROR_FAILURES = 5;
class Database {
    constructor() {
        this.isInitialized = false;
        this.eventManager = new EventManager();
        this.sseMutex = new Mutex();
        this.databaseReady = new LazyPromise();
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
                (this._fs = new FileStorage(this.options.fs, this.tokenManager, this.eventManager)));
        };
        this.crypto = () => {
            if (!this.options)
                throw new Error("Database not initialized. Did you forget to call db.setup()?");
            return new Crypto(this.storage);
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
        this._kv = new KVStorage(this.databaseReady.promise);
        this.kv = () => this._kv;
        this._config = new ConfigStorage(this.databaseReady.promise);
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
        this.tokenManager = new TokenManager(this.kv, this.eventManager);
        this.mfa = new MFAManager(this.tokenManager);
        this.subscriptions = new Subscriptions(this);
        this.circle = new Circle(this);
        this.offers = Offers;
        this.debug = new Debug();
        this.pricing = Pricing;
        this.user = new UserManager(this);
        this.syncer = new Sync(this);
        this.vault = new Vault(this);
        this.lookup = new Lookup(this);
        this.backup = new Backup(this);
        this.migrations = new Migrations(this);
        this.monographs = new Monographs(this);
        this.trash = new Trash(this);
        this.sanitizer = new Sanitizer(this.sql);
        this.monographsCollection = new MonographsCollection(this);
        this.notebooks = new Notebooks(this);
        this.tags = new Tags(this);
        this.colors = new Colors(this);
        this.content = new Content(this);
        this.attachments = new Attachments(this);
        this.noteHistory = new NoteHistory(this);
        this.shortcuts = new Shortcuts(this);
        this.reminders = new Reminders(this);
        this.relations = new Relations(this);
        this.notes = new Notes(this);
        this.vaults = new Vaults(this);
        this.settings = new Settings(this);
        this.inboxApiKeys = new InboxApiKeys(this, this.tokenManager);
        this.inboxItemsHistory = new InboxItemsHistory(this);
        this.wrapped = new Wrapped(this);
        /**
         * @deprecated only kept here for migration purposes
         */
        this.legacyTags = new CachedCollection(this.storage, "tags");
        /**
         * @deprecated only kept here for migration purposes
         */
        this.legacyColors = new CachedCollection(this.storage, "colors");
        /**
         * @deprecated only kept here for migration purposes
         */
        this.legacyNotes = new CachedCollection(this.storage, "notes");
        /**
         * @deprecated only kept here for migration purposes
         */
        this.legacySettings = new LegacySettings(this);
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
            yield dropTriggers(this.sql());
            for (const statement of [
                "PRAGMA writable_schema = 1",
                "DELETE FROM sqlite_master",
                "PRAGMA writable_schema = 0",
                "VACUUM",
                "PRAGMA integrity_check"
            ]) {
                yield sql.raw(statement).execute(this.sql());
            }
            yield initializeDatabase(this.sql().withTables(), new NNMigrationProvider(), "notesnook");
            yield this.onInit(this.sql());
            yield this.initCollections();
            return true;
        });
    }
    changePassword(password) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this._sql)
                return;
            yield changeDatabasePassword(this._sql, password);
        });
    }
    init() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.options)
                throw new Error("options not specified. Did you forget to call db.setup()?");
            this.eventManager.subscribeMulti([EVENTS.userLoggedIn, EVENTS.userFetched], this.connectSSE, this);
            this.eventManager.subscribe(EVENTS.tokenRefreshed, () => this.connectSSE());
            this.eventManager.subscribe(EVENTS.attachmentDeleted, (attachment) => __awaiter(this, void 0, void 0, function* () {
                yield this.fs().cancel(attachment.hash);
            }));
            this.eventManager.subscribe(EVENTS.userLoggedOut, () => __awaiter(this, void 0, void 0, function* () {
                yield this.monographs.clear();
                yield this.fs().clear();
                this.disconnectSSE();
            }));
            this._sql = (yield createDatabase("notesnook", Object.assign(Object.assign({}, this.options.sqliteOptions), { migrationProvider: new NNMigrationProvider(), onInit: (db) => this.onInit(db) })));
            this.databaseReady.resolve(this._sql);
            yield this.sanitizer.init();
            yield this.initCollections();
            yield this.migrations.init();
            this.isInitialized = true;
            if (this.migrations.required()) {
                logger.warn("Database migration is required.");
            }
        });
    }
    onInit(db) {
        return __awaiter(this, void 0, void 0, function* () {
            yield createTriggers(db);
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
            this.monographs.refresh().catch(logger.error);
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
                this.eventSource = new EventSource(`${Hosts.SSE_HOST}/sse`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                this.eventSource.onopen = () => __awaiter(this, void 0, void 0, function* () {
                    logger.log("SSE: opened channel successfully!");
                });
                this.eventSource.onerror = function (error) {
                    logger.error(error, "SSE: error");
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
                                this.eventManager.publish(EVENTS.userSubscriptionUpdated, data);
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
                                this.eventManager.publish(EVENTS.userEmailConfirmed);
                                break;
                            }
                            case "triggerSync": {
                                this.eventManager.publish(EVENTS.databaseSyncRequested, true, false);
                                break;
                            }
                            case "inboxUpdated": {
                                yield this.user.fetchUser();
                                break;
                            }
                        }
                    }
                    catch (e) {
                        logger.error("SSE: Unsupported message. Message = ", event.data);
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
        Hosts.AUTH_HOST = hosts.AUTH_HOST || Hosts.AUTH_HOST;
        Hosts.API_HOST = hosts.API_HOST || Hosts.API_HOST;
        Hosts.SSE_HOST = hosts.SSE_HOST || Hosts.SSE_HOST;
        Hosts.SUBSCRIPTIONS_HOST =
            hosts.SUBSCRIPTIONS_HOST || Hosts.SUBSCRIPTIONS_HOST;
        Hosts.ISSUES_HOST = hosts.ISSUES_HOST || Hosts.ISSUES_HOST;
        Hosts.MONOGRAPH_HOST = hosts.MONOGRAPH_HOST || Hosts.MONOGRAPH_HOST;
        Hosts.NOTESNOOK_HOST = hosts.NOTESNOOK_HOST || Hosts.NOTESNOOK_HOST;
    }
    version() {
        return http.get(`${Hosts.API_HOST}/version`);
    }
    announcements() {
        return __awaiter(this, void 0, void 0, function* () {
            let url = `${Hosts.API_HOST}/announcements/active`;
            const user = yield this.user.getUser();
            if (user)
                url += `?userId=${user.id}`;
            return http.get(url);
        });
    }
}
export default Database;
