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
import EventManager from "./utils/event-manager.js";
export const EV = new EventManager();
export const SYNC_CHECK_IDS = {
    autoSync: "autoSync",
    sync: "sync"
};
export function checkSyncStatus(eventManager, type) {
    return __awaiter(this, void 0, void 0, function* () {
        const results = yield eventManager.publishWithResult(EVENTS.syncCheckStatus, type);
        if (typeof results === "boolean")
            return results;
        else if (typeof results === "undefined")
            return true;
        return results.some((r) => r.type === type && r.result === true);
    });
}
export function sendSyncProgressEvent(eventManager, type, current) {
    eventManager.publish(EVENTS.syncProgress, {
        type,
        current
    });
}
export function sendMigrationProgressEvent(eventManager, collection, total, current) {
    eventManager.publish(EVENTS.migrationProgress, {
        collection,
        total,
        current: current === undefined ? total : current
    });
}
export const CLIENT_ID = "notesnook";
export const EVENTS = {
    userSubscriptionUpdated: "user:subscriptionUpdated",
    userEmailConfirmed: "user:emailConfirmed",
    userLoggedIn: "user:loggedIn",
    userLoggedOut: "user:loggedOut",
    userFetched: "user:fetched",
    userSignedUp: "user:signedUp",
    userSessionExpired: "user:sessionExpired",
    databaseSyncRequested: "db:syncRequested",
    syncProgress: "sync:progress",
    syncCompleted: "sync:completed",
    syncItemMerged: "sync:itemMerged",
    syncAborted: "sync:aborted",
    syncCheckStatus: "sync:checkStatus",
    databaseUpdated: "db:updated",
    databaseCollectionInitiated: "db:collectionInitiated",
    appRefreshRequested: "app:refreshRequested",
    migrationProgress: "migration:progress",
    migrationStarted: "migration:start",
    migrationFinished: "migration:finished",
    noteRemoved: "note:removed",
    tokenRefreshed: "token:refreshed",
    userUnauthorized: "user:unauthorized",
    downloadCanceled: "file:downloadCanceled",
    uploadCanceled: "file:uploadCanceled",
    fileDownload: "file:download",
    fileUpload: "file:upload",
    fileDownloaded: "file:downloaded",
    fileUploaded: "file:uploaded",
    attachmentDeleted: "attachment:deleted",
    mediaAttachmentDownloaded: "attachments:mediaDownloaded",
    monographsUpdated: "monographs:updated",
    vaultLocked: "vault:locked",
    vaultUnlocked: "vault:unlocked",
    systemTimeInvalid: "system:invalidTime",
    vaultAutoLocked: "vault:autoLocked"
};
const separators = ["-", "/", "."];
const DD = "DD";
const MM = "MM";
const YYYY = "YYYY";
export const DATE_FORMATS = [
    ...[
        [DD, MM, YYYY],
        [MM, DD, YYYY],
        [YYYY, MM, DD]
    ]
        .map((item) => separators.map((sep) => item.join(sep)))
        .flat(),
    "MMM D, YYYY"
];
export const TIME_FORMATS = ["12-hour", "24-hour"];
export const CURRENT_DATABASE_VERSION = 6.1;
export const FREE_NOTEBOOKS_LIMIT = 20;
