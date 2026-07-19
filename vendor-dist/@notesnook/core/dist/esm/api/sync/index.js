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
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
import { checkSyncStatus, CURRENT_DATABASE_VERSION, EVENTS, sendSyncProgressEvent, SYNC_CHECK_IDS } from "../../common.js";
import Constants from "../../utils/constants.js";
import TokenManager from "../token-manager.js";
import Collector from "./collector.js";
import Merger, { handleInboxItems } from "./merger.js";
import { AutoSync } from "./auto-sync.js";
import { logger } from "../../logger.js";
import { Mutex } from "async-mutex";
import { migrateItem, migrateVaultKey } from "../../migrations.js";
import { isDeleted, isTrashItem } from "../../types.js";
import { KEY_VERSION, SYNC_COLLECTIONS_MAP } from "./types.js";
import { SyncDevices } from "./devices.js";
import { DefaultColors } from "../../collections/colors.js";
var LogLevel;
(function (LogLevel) {
    /** Log level for very low severity diagnostic messages. */
    LogLevel[LogLevel["Trace"] = 0] = "Trace";
    /** Log level for low severity diagnostic messages. */
    LogLevel[LogLevel["Debug"] = 1] = "Debug";
    /** Log level for informational diagnostic messages. */
    LogLevel[LogLevel["Information"] = 2] = "Information";
    /** Log level for diagnostic messages that indicate a non-fatal problem. */
    LogLevel[LogLevel["Warning"] = 3] = "Warning";
    /** Log level for diagnostic messages that indicate a failure in the current operation. */
    LogLevel[LogLevel["Error"] = 4] = "Error";
    /** Log level for diagnostic messages that indicate a failure that will terminate the entire application. */
    LogLevel[LogLevel["Critical"] = 5] = "Critical";
    /** The highest possible log level. Used when configuring logging to indicate that no log messages should be emitted. */
    LogLevel[LogLevel["None"] = 6] = "None";
})(LogLevel || (LogLevel = {}));
var HubConnectionState;
(function (HubConnectionState) {
    /** The hub connection is disconnected. */
    HubConnectionState["Disconnected"] = "Disconnected";
    /** The hub connection is connecting. */
    HubConnectionState["Connecting"] = "Connecting";
    /** The hub connection is connected. */
    HubConnectionState["Connected"] = "Connected";
    /** The hub connection is disconnecting. */
    HubConnectionState["Disconnecting"] = "Disconnecting";
    /** The hub connection is reconnecting. */
    HubConnectionState["Reconnecting"] = "Reconnecting";
})(HubConnectionState || (HubConnectionState = {}));
export default class SyncManager {
    constructor(db) {
        this.db = db;
        this.sync = new Sync(db);
        this.devices = this.sync.devices;
    }
    start(options) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                if (yield checkSyncStatus(this.db.eventManager, SYNC_CHECK_IDS.autoSync))
                    yield this.sync.autoSync.start();
                yield this.sync.start(options);
                return true;
            }
            catch (e) {
                const isHubException = e.message.includes("HubException:");
                if (isHubException) {
                    const actualError = /HubException: (.*)/gm.exec(e.message);
                    const errorText = actualError && actualError.length > 1
                        ? actualError[1]
                        : e.message;
                    // NOTE: sometimes there's the case where the user has already
                    // confirmed their email but the server still thinks that it
                    // isn't confirmed. This check is added to trigger a force
                    // update of the access token.
                    if ((errorText.includes("Please confirm your email ") ||
                        errorText.includes("Invalid token.")) &&
                        ((_a = (yield this.db.user.getUser())) === null || _a === void 0 ? void 0 : _a.isEmailConfirmed)) {
                        yield this.db.tokenManager._refreshToken(true);
                        return false;
                    }
                    throw new Error(errorText);
                }
                throw e;
            }
        });
    }
    acquireLock(callback) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                this.sync.autoSync.stop();
                yield callback();
            }
            finally {
                yield this.sync.autoSync.start();
            }
        });
    }
    stop() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.sync.cancel();
        });
    }
}
export class Sync {
    constructor(db) {
        this.db = db;
        this.logger = logger.scope("Sync");
        this.syncConnectionMutex = new Mutex();
        this.conflictedNoteIds = [];
        this.uncachedAttachments = [];
        this.collector = new Collector(db);
        this.merger = new Merger(db);
        this.autoSync = new AutoSync(db, 1000);
        this.devices = new SyncDevices(db.kv, db.tokenManager);
        db.eventManager.subscribe(EVENTS.userLoggedOut, () => __awaiter(this, void 0, void 0, function* () {
            var _a;
            yield ((_a = this.connection) === null || _a === void 0 ? void 0 : _a.stop());
            this.autoSync.stop();
        }));
    }
    start(options) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.createConnection(options);
            if (!this.connection)
                return;
            if (!(yield checkSyncStatus(this.db.eventManager, SYNC_CHECK_IDS.sync))) {
                yield this.connection.stop();
                return;
            }
            if (!(yield this.db.user.getUser()))
                return;
            this.logger.info("Starting sync", options);
            this.connection.onclose((error = new Error("Connection closed.")) => {
                this.db.eventManager.publish(EVENTS.syncAborted);
                this.logger.error(error);
                throw new Error("Connection closed.");
            });
            const { deviceId } = yield this.init(options.force);
            this.logger.info("Initialized sync", { deviceId });
            if (options.type === "fetch" || options.type === "full") {
                yield this.fetch(deviceId, options);
                this.logger.info("Data fetched");
            }
            if ((options.type === "send" || options.type === "full") &&
                (yield this.send(deviceId, options.force)))
                this.logger.info("New data sent");
            yield this.stop(options);
            if (!(yield checkSyncStatus(this.db.eventManager, SYNC_CHECK_IDS.autoSync))) {
                yield this.connection.stop();
                this.autoSync.stop();
            }
        });
    }
    init(isForceSync) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.checkConnection();
            if (isForceSync) {
                yield this.devices.unregister();
                yield this.devices.register();
            }
            let deviceId = yield this.devices.get();
            if (!deviceId) {
                yield this.devices.register();
                deviceId = yield this.devices.get();
            }
            if (!deviceId)
                throw new Error("Sync device not registered.");
            return { deviceId };
        });
    }
    fetch(deviceId, options) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            yield this.checkConnection();
            try {
                yield ((_a = this.connection) === null || _a === void 0 ? void 0 : _a.invoke("RequestFetchV4", deviceId));
            }
            catch (error) {
                if (error instanceof Error &&
                    error.message.includes("HubException: Method does not exist")) {
                    this.logger.warn("RequestFetchV4 failed, falling back to RequestFetchV3");
                    yield ((_b = this.connection) === null || _b === void 0 ? void 0 : _b.invoke("RequestFetchV3", deviceId));
                }
                else
                    throw error;
            }
            if (this.conflictedNoteIds.length > 0) {
                yield this.db
                    .sql()
                    .updateTable("notes")
                    .where("id", "in", this.conflictedNoteIds)
                    .set({ conflicted: true })
                    .execute();
                this.conflictedNoteIds = [];
            }
            if (this.uncachedAttachments.length > 0 && options.offlineMode) {
                yield this.db
                    .fs()
                    .queueDownloads(this.uncachedAttachments, "offline-mode", {
                    readOnDownload: false
                });
                this.uncachedAttachments = [];
            }
        });
    }
    send(deviceId, isForceSync) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, e_1, _b, _c;
            var _d;
            yield this.uploadAttachments();
            let done = 0;
            let total = 0;
            try {
                for (var _e = true, _f = __asyncValues(this.collector.collect(100, isForceSync)), _g; _g = yield _f.next(), _a = _g.done, !_a; _e = true) {
                    _c = _g.value;
                    _e = false;
                    const item = _c;
                    total += item.items.length;
                    const result = yield this.pushItem(deviceId, item);
                    this.logger.info(`Batch sent for type ${item.type}`, {
                        result,
                        length: item.items.length,
                        type: item.type
                    });
                    if (result) {
                        done += item.items.length;
                        sendSyncProgressEvent(this.db.eventManager, "upload", done);
                    }
                    else {
                        this.logger.error(new Error(`Failed to send batch. Server returned falsy response.`));
                    }
                }
            }
            catch (e_1_1) { e_1 = { error: e_1_1 }; }
            finally {
                try {
                    if (!_e && !_a && (_b = _f.return)) yield _b.call(_f);
                }
                finally { if (e_1) throw e_1.error; }
            }
            this.logger.info(`Sync send completed. Sent ${done} out of ${total} items.`, { done, total });
            if (done !== total)
                throw new Error(`Failed to send all items. Sent ${done} out of ${total}.`);
            if (total === 0)
                return false;
            yield ((_d = this.connection) === null || _d === void 0 ? void 0 : _d.send("PushCompletedV2", deviceId));
            return true;
        });
    }
    stop(options) {
        return __awaiter(this, void 0, void 0, function* () {
            if ((options.type === "send" || options.type === "full") &&
                (yield this.collector.hasUnsyncedChanges())) {
                this.logger.info("Changes made during last sync. Syncing again...");
                yield this.start({ type: "send" });
                return;
            }
            // refresh monographs
            yield this.db.monographs.refresh().catch(this.logger.error);
            // update trash cache
            yield this.db.trash.cleanup();
            this.logger.info("Stopping sync");
            yield this.db.setLastSynced(Date.now());
            this.db.eventManager.publish(EVENTS.syncCompleted);
        });
    }
    cancel() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            this.logger.info("Sync canceled");
            yield ((_a = this.connection) === null || _a === void 0 ? void 0 : _a.stop());
        });
    }
    /**
     * @private
     */
    uploadAttachments() {
        return __awaiter(this, void 0, void 0, function* () {
            const attachments = yield this.db.attachments.pending.items();
            this.logger.info("Uploading attachments...", { total: attachments.length });
            yield this.db.fs().queueUploads(attachments.map((a) => ({
                filename: a.hash,
                chunkSize: a.chunkSize
            })), "sync-uploads");
        });
    }
    /**
     * @private
     */
    onPushCompleted(deviceId) {
        return __awaiter(this, void 0, void 0, function* () {
            this.db.eventManager.publish(EVENTS.databaseSyncRequested, true, false, deviceId);
        });
    }
    processChunk(chunk, keys, options) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const itemType = chunk.type;
            const decrypted = [];
            // Pre-group items by keyVersion for O(1) lookups
            const itemsByKeyVersion = new Map();
            const versionMap = new Map();
            for (const item of chunk.items) {
                const keyVersion = (_a = item.keyVersion) !== null && _a !== void 0 ? _a : KEY_VERSION.LEGACY;
                const group = itemsByKeyVersion.get(keyVersion);
                if (group) {
                    group.push(item);
                }
                else {
                    itemsByKeyVersion.set(keyVersion, [item]);
                }
                versionMap.set(item.id, item.v);
            }
            for (const keyInfo of keys) {
                const itemsToDecrypt = itemsByKeyVersion.get(keyInfo.version);
                if (!itemsToDecrypt || itemsToDecrypt.length === 0)
                    continue;
                decrypted.push(...(yield this.db.storage().decryptMulti(keyInfo.key, itemsToDecrypt)));
            }
            const deserialized = [];
            for (let i = 0; i < decrypted.length; ++i) {
                const decryptedItem = JSON.parse(decrypted[i]);
                const version = versionMap.get(decryptedItem.id);
                if (version === undefined) {
                    this.logger.error(new Error(`Version not found for item ${decryptedItem.id}. Skipping item.`));
                    continue;
                }
                const item = yield deserializeItem(decryptedItem, itemType, version, this.db);
                if (item)
                    deserialized.push(item);
            }
            const collectionType = SYNC_COLLECTIONS_MAP[itemType];
            if (!collectionType) {
                this.logger.error(new Error(`Unknown collection type for item type ${itemType}. Skipping chunk.`));
                return;
            }
            const collection = this.db[collectionType].collection;
            const localItems = yield collection.records(chunk.items.map((i) => i.id));
            let items = [];
            if (itemType === "content") {
                items = deserialized.map((item) => this.merger.mergeContent(item, localItems[item.id]));
            }
            else {
                items =
                    itemType === "attachment"
                        ? yield Promise.all(deserialized.map((item) => this.merger.mergeAttachment(item, localItems[item.id])))
                        : deserialized.map((item) => this.merger.mergeItem(item, localItems[item.id]));
            }
            if (itemType === "note" || itemType === "content") {
                items.forEach((item) => this.db.eventManager.publish(EVENTS.syncItemMerged, item));
                for (const item of items)
                    if (!(item === null || item === void 0 ? void 0 : item.deleted) && (item === null || item === void 0 ? void 0 : item.type) === "tiptap" && !!item.conflicted)
                        this.conflictedNoteIds.push(item.noteId);
            }
            if (itemType === "attachment" && options.offlineMode)
                for (const item of items)
                    if (!(item === null || item === void 0 ? void 0 : item.deleted) && (item === null || item === void 0 ? void 0 : item.type) === "attachment")
                        this.uncachedAttachments.push({
                            filename: item.hash,
                            chunkSize: item.chunkSize
                        });
            this.logger.debug(`Merged ${items.length} items for type ${itemType}`, {
                ids: items.map((i) => i === null || i === void 0 ? void 0 : i.id)
            });
            yield collection.put(items);
        });
    }
    pushItem(deviceId, item) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            yield this.checkConnection();
            return (yield ((_a = this.connection) === null || _a === void 0 ? void 0 : _a.invoke("PushItems", deviceId, item))) === 1;
        });
    }
    createConnection(options) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.connection)
                return;
            const { HubConnectionBuilder, HttpTransportType, JsonHubProtocol } = yield import("@microsoft/signalr");
            const tokenManager = new TokenManager(this.db.kv, this.db.eventManager);
            this.connection = new HubConnectionBuilder()
                .withUrl(`${Constants.API_HOST}/hubs/sync/v2`, {
                accessTokenFactory: () => __awaiter(this, void 0, void 0, function* () {
                    const token = yield tokenManager.getAccessToken();
                    if (!token)
                        throw new Error("Failed to get access token.");
                    return token;
                }),
                skipNegotiation: true,
                transport: HttpTransportType.WebSockets,
                logger: {
                    log: (level, message) => {
                        const scopedLogger = logger.scope("SignalR::SyncHub");
                        switch (level) {
                            case LogLevel.Critical:
                                return scopedLogger.fatal(new Error(message));
                            case LogLevel.Error: {
                                this.db.eventManager.publish(EVENTS.syncAborted, message);
                                return scopedLogger.error(new Error(message));
                            }
                            case LogLevel.Warning:
                                return scopedLogger.warn(message);
                        }
                    }
                }
            })
                .withHubProtocol(new JsonHubProtocol())
                .build();
            this.connection.serverTimeoutInMilliseconds = 60 * 1000 * 5;
            this.connection.on("PushCompletedV2", (deviceId) => this.onPushCompleted(deviceId));
            this.connection.on("SendVaultKey", (vaultKey) => __awaiter(this, void 0, void 0, function* () {
                var _a;
                if (((_a = this.connection) === null || _a === void 0 ? void 0 : _a.state) !== HubConnectionState.Connected)
                    return false;
                if (vaultKey &&
                    vaultKey.cipher !== null &&
                    vaultKey.iv !== null &&
                    vaultKey.salt !== null &&
                    vaultKey.length > 0) {
                    const vault = yield this.db.vaults.default();
                    if (!vault)
                        yield migrateVaultKey(this.db, vaultKey, 5.9, CURRENT_DATABASE_VERSION);
                }
                return true;
            }));
            this.connection.on("SendItems", (chunk) => __awaiter(this, void 0, void 0, function* () {
                var _a;
                if (((_a = this.connection) === null || _a === void 0 ? void 0 : _a.state) !== HubConnectionState.Connected)
                    return false;
                const keys = yield this.db.user.getDataEncryptionKeys();
                if (!keys || !keys.length) {
                    this.logger.error(new Error("User encryption keys not generated. Please relogin."));
                    this.db.eventManager.publish(EVENTS.userSessionExpired);
                    return false;
                }
                this.logger.info(`Received chunk for type ${chunk.type} with ${chunk.items.length} items.`, {
                    ids: chunk.items.map((i) => i.id)
                });
                yield this.processChunk(chunk, keys, options);
                sendSyncProgressEvent(this.db.eventManager, `download`, chunk.count);
                return true;
            }));
            this.connection.on("SendMonographs", (monographs) => __awaiter(this, void 0, void 0, function* () {
                var _a;
                if (((_a = this.connection) === null || _a === void 0 ? void 0 : _a.state) !== HubConnectionState.Connected)
                    return false;
                const ids = monographs.map((m) => m.id);
                yield this.db.monographsCollection.collection.put(monographs.map((m) => (Object.assign(Object.assign({}, m), { type: "monograph" }))));
                yield this.db.monographs.refresh().catch(this.logger.error);
                this.db.eventManager.publish(EVENTS.monographsUpdated, ids);
                return true;
            }));
            this.connection.on("SendInboxItems", (inboxItems) => __awaiter(this, void 0, void 0, function* () {
                var _a;
                if (((_a = this.connection) === null || _a === void 0 ? void 0 : _a.state) !== HubConnectionState.Connected) {
                    return false;
                }
                yield handleInboxItems(inboxItems, this.db);
                return true;
            }));
        });
    }
    checkConnection() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.syncConnectionMutex.runExclusive(() => __awaiter(this, void 0, void 0, function* () {
                try {
                    if (this.connection &&
                        this.connection.state !== HubConnectionState.Connected) {
                        if (this.connection.state !== HubConnectionState.Disconnected) {
                            yield this.connection.stop();
                        }
                        yield promiseTimeout(30000, this.connection.start());
                    }
                }
                catch (e) {
                    this.logger.error(e, "Could not connect to the Sync server.");
                    if (e instanceof Error) {
                        this.logger.warn(e.message);
                        throw new Error("Could not connect to the Sync server. Please try again.");
                    }
                }
            }));
        });
    }
}
function promiseTimeout(ms, promise) {
    // Create a promise that rejects in <ms> milliseconds
    const timeout = new Promise((resolve, reject) => {
        const id = setTimeout(() => {
            clearTimeout(id);
            reject(new Error("Sync timed out in " + ms + "ms."));
        }, ms);
    });
    // Returns a race between our timeout and the passed in promise
    return Promise.race([promise, timeout]);
}
function deserializeItem(item, type, version, database) {
    return __awaiter(this, void 0, void 0, function* () {
        item.remote = true;
        item.synced = true;
        let migrationResult = yield migrateItem(item, version, CURRENT_DATABASE_VERSION, isDeleted(item) ? type : item.type, database, "sync");
        if (migrationResult === "skip")
            return;
        // since items in trash can have their own set of migrations,
        // we have to run the migration again to account for that.
        if (isTrashItem(item)) {
            migrationResult = yield migrateItem(item, version, CURRENT_DATABASE_VERSION, item.itemType, database, "sync");
            if (migrationResult === "skip")
                return;
        }
        const itemType = isDeleted(item)
            ? type
            : // colors are naively of type "tag" instead of "color" so we have to fix that.
                item.type === "tag" && DefaultColors[item.title.toLowerCase()]
                    ? "color"
                    : item.type === "trash" && "itemType" in item && item.itemType
                        ? item.itemType
                        : item.type;
        if (!itemType || itemType === "topic" || itemType === "settings")
            return;
        if (migrationResult)
            item.synced = false;
        return item;
    });
}
