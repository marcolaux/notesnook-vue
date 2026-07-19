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
const http_js_1 = __importDefault(require("../utils/http.js"));
const constants_js_1 = __importDefault(require("../utils/constants.js"));
const token_manager_js_1 = __importDefault(require("./token-manager.js"));
const common_js_1 = require("../common.js");
const healthcheck_js_1 = require("./healthcheck.js");
const logger_js_1 = require("../logger.js");
const types_js_1 = require("./sync/types.js");
const key_manager_js_1 = require("./key-manager.js");
const ENDPOINTS = {
    signup: "/users",
    token: "/connect/token",
    user: "/users",
    deleteUser: "/users/delete",
    patchUser: "/account",
    verifyUser: "/account/verify",
    revoke: "/connect/revocation",
    recoverAccount: "/account/recover",
    resetUser: "/users/reset",
    activateTrial: "/subscriptions/trial"
};
class UserManager {
    constructor(db) {
        this.db = db;
        this.keyManager = new key_manager_js_1.KeyManager(db);
        this.tokenManager = new token_manager_js_1.default(db.kv, db.eventManager);
        common_js_1.EV.subscribe(common_js_1.EVENTS.userUnauthorized, (url) => __awaiter(this, void 0, void 0, function* () {
            if (url.includes("/connect/token") || !(yield healthcheck_js_1.HealthCheck.auth()))
                return;
            try {
                yield this.tokenManager._refreshToken(true);
            }
            catch (e) {
                if (e instanceof Error &&
                    (e.message === "invalid_grant" || e.message === "invalid_client")) {
                    yield this.logout(false, `Your token has been revoked. Error: ${e.message}.`);
                }
            }
        }));
    }
    init() {
        return __awaiter(this, void 0, void 0, function* () {
            const user = yield this.getUser();
            if (!user)
                return;
        });
    }
    signup(email, password) {
        return __awaiter(this, void 0, void 0, function* () {
            email = email.toLowerCase();
            const hashedPassword = yield this.db.storage().hash(password, email);
            yield this.tokenManager.saveToken(yield http_js_1.default.post(`${constants_js_1.default.API_HOST}${ENDPOINTS.signup}`, {
                email,
                password: hashedPassword,
                client_id: "notesnook"
            }));
            const user = yield this.fetchUser();
            if (!user)
                throw new Error("Failed to fetch user after signup.");
            yield this.db.setLastSynced(0);
            yield this.db.syncer.devices.register();
            yield this.db.storage().deriveCryptoKey({
                password,
                salt: user.salt
            });
            const masterKey = yield this.getMasterKey();
            if (!masterKey)
                throw new Error("User encryption key not generated.");
            yield this.updateUser({
                dataEncryptionKey: yield this.keyManager.wrapKey(yield this.db.crypto().generateRandomKey(), masterKey),
                attachmentsKey: yield this.keyManager.wrapKey(yield this.db.crypto().generateRandomKey(), masterKey),
                monographPasswordsKey: yield this.keyManager.wrapKey(yield this.db.crypto().generateRandomKey(), masterKey)
            });
            this.db.eventManager.publish(common_js_1.EVENTS.userLoggedIn, user);
        });
    }
    authenticateEmail(email) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!email)
                throw new Error("Email is required.");
            email = email.toLowerCase();
            const result = yield http_js_1.default.post(`${constants_js_1.default.AUTH_HOST}${ENDPOINTS.token}`, {
                email,
                grant_type: "email",
                client_id: "notesnook"
            });
            yield this.tokenManager.saveToken(result);
            return result.additional_data;
        });
    }
    authenticateMultiFactorCode(code, method) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!code || !method)
                throw new Error("code & method are required.");
            const token = yield this.tokenManager.getToken();
            if (!token || token.scope !== "auth:grant_types:mfa")
                throw new Error("No token found.");
            yield this.tokenManager.saveToken(yield http_js_1.default.post(`${constants_js_1.default.AUTH_HOST}${ENDPOINTS.token}`, {
                grant_type: "mfa",
                client_id: "notesnook",
                "mfa:code": code,
                "mfa:method": method
            }, token.access_token));
            return true;
        });
    }
    authenticatePassword(email, password, hashedPassword, sessionExpired) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!email || !password)
                throw new Error("email & password are required.");
            const token = yield this.tokenManager.getToken();
            if (!token || token.scope !== "auth:grant_types:mfa_password")
                throw new Error("No token found.");
            email = email.toLowerCase();
            if (!hashedPassword) {
                hashedPassword = yield this.db.storage().hash(password, email);
            }
            try {
                let usesFallback = false;
                yield this.tokenManager.saveToken(yield http_js_1.default
                    .post(`${constants_js_1.default.AUTH_HOST}${ENDPOINTS.token}`, {
                    grant_type: "mfa_password",
                    client_id: "notesnook",
                    scope: "notesnook.sync offline_access IdentityServerApi",
                    password: hashedPassword
                }, token.access_token)
                    .catch((e) => __awaiter(this, void 0, void 0, function* () {
                    if (e instanceof Error && e.message === "Password is incorrect.") {
                        hashedPassword = yield this.db
                            .storage()
                            .hash(password, email, { usesFallback: true });
                        if (hashedPassword === null)
                            return Promise.reject(e);
                        usesFallback = true;
                        return yield http_js_1.default.post(`${constants_js_1.default.AUTH_HOST}${ENDPOINTS.token}`, {
                            grant_type: "mfa_password",
                            client_id: "notesnook",
                            scope: "notesnook.sync offline_access IdentityServerApi",
                            password: hashedPassword
                        }, token.access_token);
                    }
                    return Promise.reject(e);
                })));
                const user = yield this.fetchUser();
                if (!user)
                    throw new Error("Failed to fetch user.");
                if (!sessionExpired) {
                    yield this.db.setLastSynced(0);
                    yield this.db.syncer.devices.register();
                }
                if (usesFallback) {
                    yield this.db.storage().deriveCryptoKeyFallback({
                        password,
                        salt: user.salt
                    });
                }
                else {
                    yield this.db.storage().deriveCryptoKey({
                        password,
                        salt: user.salt
                    });
                }
                this.db.eventManager.publish(common_js_1.EVENTS.userLoggedIn, user);
            }
            catch (e) {
                yield this.tokenManager.saveToken(token);
                throw e;
            }
        });
    }
    getSessions() {
        return __awaiter(this, void 0, void 0, function* () {
            const token = yield this.tokenManager.getAccessToken();
            if (!token)
                return;
            yield http_js_1.default.get(`${constants_js_1.default.AUTH_HOST}/account/sessions`, token);
        });
    }
    clearSessions() {
        return __awaiter(this, arguments, void 0, function* (all = false) {
            const token = yield this.tokenManager.getToken();
            if (!token)
                return;
            const { access_token, refresh_token } = token;
            yield http_js_1.default.post(`${constants_js_1.default.AUTH_HOST}/account/sessions/clear?all=${all}`, { refresh_token }, access_token);
        });
    }
    activateTrial() {
        return __awaiter(this, void 0, void 0, function* () {
            const token = yield this.tokenManager.getAccessToken();
            if (!token)
                return false;
            yield http_js_1.default.post(`${constants_js_1.default.SUBSCRIPTIONS_HOST}${ENDPOINTS.activateTrial}`, null, token);
            return true;
        });
    }
    logout() {
        return __awaiter(this, arguments, void 0, function* (revoke = true, reason) {
            try {
                yield this.db.syncer.devices.unregister();
                if (revoke)
                    yield this.tokenManager.revokeToken();
            }
            catch (e) {
                logger_js_1.logger.error(e, "Error logging out user.", { revoke, reason });
            }
            finally {
                this.keyManager.clearCache();
                yield this.db.reset();
                this.db.eventManager.publish(common_js_1.EVENTS.userLoggedOut, reason);
                this.db.eventManager.publish(common_js_1.EVENTS.appRefreshRequested);
            }
        });
    }
    setUser(user) {
        return this.db.kv().write("user", user);
    }
    getUser() {
        return this.db.kv().read("user");
    }
    /**
     * @deprecated
     */
    getLegacyUser() {
        return this.db.storage().read("user");
    }
    resetUser() {
        return __awaiter(this, arguments, void 0, function* (removeAttachments = true) {
            const token = yield this.tokenManager.getAccessToken();
            if (!token)
                return;
            yield http_js_1.default.post(`${constants_js_1.default.API_HOST}${ENDPOINTS.resetUser}`, { removeAttachments }, token);
            return true;
        });
    }
    updateUser(partial) {
        return __awaiter(this, void 0, void 0, function* () {
            const user = yield this.getUser();
            if (!user)
                return;
            const token = yield this.tokenManager.getAccessToken();
            yield http_js_1.default.patch.json(`${constants_js_1.default.API_HOST}${ENDPOINTS.user}`, partial, token);
            yield this.setUser(Object.assign(Object.assign({}, user), partial));
        });
    }
    deleteUser(password) {
        return __awaiter(this, void 0, void 0, function* () {
            const token = yield this.tokenManager.getAccessToken();
            const user = yield this.getUser();
            if (!token || !user)
                return;
            yield http_js_1.default.post(`${constants_js_1.default.API_HOST}${ENDPOINTS.deleteUser}`, {
                password: yield this.db.storage().hash(password, user.email, {
                    usesFallback: yield this.usesFallbackPWHash(password)
                })
            }, token);
            yield this.logout(false, "Account deleted.");
            return true;
        });
    }
    fetchUser() {
        return __awaiter(this, void 0, void 0, function* () {
            this.keyManager.clearCache();
            const oldUser = yield this.getUser();
            try {
                const token = yield this.tokenManager.getAccessToken();
                if (!token)
                    return;
                const user = yield http_js_1.default.get(`${constants_js_1.default.API_HOST}${ENDPOINTS.user}`, token);
                if (user) {
                    yield this.setUser(user);
                    if (oldUser &&
                        (oldUser.subscription.plan !== user.subscription.plan ||
                            oldUser.subscription.status !== user.subscription.status ||
                            oldUser.subscription.provider !== user.subscription.provider)) {
                        yield this.tokenManager._refreshToken(true);
                        this.db.eventManager.publish(common_js_1.EVENTS.userSubscriptionUpdated, user.subscription);
                    }
                    if (oldUser && !oldUser.isEmailConfirmed && user.isEmailConfirmed)
                        this.db.eventManager.publish(common_js_1.EVENTS.userEmailConfirmed);
                    this.db.eventManager.publish(common_js_1.EVENTS.userFetched, user);
                    return user;
                }
                else {
                    return oldUser;
                }
            }
            catch (e) {
                logger_js_1.logger.error(e, "Error fetching user");
                return oldUser;
            }
        });
    }
    changePassword(oldPassword, newPassword) {
        return this._updatePassword("change", {
            old_password: oldPassword,
            new_password: newPassword
        });
    }
    changeMarketingConsent(enabled) {
        return __awaiter(this, void 0, void 0, function* () {
            const token = yield this.tokenManager.getAccessToken();
            if (!token)
                return;
            yield http_js_1.default.patch(`${constants_js_1.default.AUTH_HOST}${ENDPOINTS.patchUser}`, {
                type: "change_marketing_consent",
                enabled: enabled
            }, token);
        });
    }
    resetPassword(newPassword) {
        return this._updatePassword("reset", {
            new_password: newPassword
        });
    }
    getDataEncryptionKeys() {
        return __awaiter(this, void 0, void 0, function* () {
            const masterKey = yield this.getMasterKey();
            if (!masterKey)
                return;
            const dataEncryptionKey = yield this.keyManager.get("dataEncryptionKey", {
                refetchUser: false
            });
            if (!dataEncryptionKey)
                return [
                    {
                        key: masterKey,
                        version: types_js_1.KEY_VERSION.LEGACY
                    }
                ];
            const keys = [];
            const legacyDataEncryptionKey = yield this.keyManager.get("legacyDataEncryptionKey", {
                refetchUser: false
            });
            if (legacyDataEncryptionKey)
                keys.push({
                    key: yield this.keyManager.unwrapKey(legacyDataEncryptionKey, masterKey),
                    version: types_js_1.KEY_VERSION.LEGACY
                });
            keys.push({
                key: yield this.keyManager.unwrapKey(dataEncryptionKey, masterKey),
                version: types_js_1.KEY_VERSION.DEK
            });
            return keys;
        });
    }
    getMasterKey() {
        return __awaiter(this, void 0, void 0, function* () {
            const user = yield this.getUser();
            if (!user)
                return;
            const key = yield this.db.storage().getCryptoKey();
            if (!key)
                return;
            return { key, salt: user.salt };
        });
    }
    /**
     * @deprecated
     */
    getLegacyEncryptionKey() {
        return __awaiter(this, void 0, void 0, function* () {
            const user = yield this.getLegacyUser();
            if (!user)
                return;
            const key = yield this.db.storage().getCryptoKey();
            if (!key)
                return;
            return { key, salt: user.salt };
        });
    }
    getUserKey(id, config) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const masterKey = yield this.getMasterKey();
                if (!masterKey)
                    return;
                const wrappedKey = yield this.keyManager.get(id);
                if (!wrappedKey) {
                    const key = yield config.generateKey();
                    yield this.updateUser({
                        [id]: yield this.keyManager.wrapKey(key, masterKey)
                    });
                    return key;
                }
                return (yield this.keyManager.unwrapKey(wrappedKey, masterKey));
            }
            catch (e) {
                logger_js_1.logger.error(e, `Could not get ${config.errorContext}.`);
                if (e instanceof Error)
                    throw new Error(`Could not get ${config.errorContext}. Error: ${e.message}`);
            }
        });
    }
    getAttachmentsKey() {
        return __awaiter(this, void 0, void 0, function* () {
            return this.getUserKey("attachmentsKey", {
                generateKey: () => this.db.crypto().generateRandomKey(),
                errorContext: "attachments encryption key"
            });
        });
    }
    getMonographPasswordsKey() {
        return __awaiter(this, void 0, void 0, function* () {
            return this.getUserKey("monographPasswordsKey", {
                generateKey: () => this.db.crypto().generateRandomKey(),
                errorContext: "monographs encryption key"
            });
        });
    }
    getInboxKeys() {
        return __awaiter(this, void 0, void 0, function* () {
            return this.getUserKey("inboxKeys", {
                generateKey: () => this.db.crypto().generatePGPKeyPair(),
                errorContext: "inbox encryption keys"
            });
        });
    }
    hasInboxKeys() {
        return __awaiter(this, void 0, void 0, function* () {
            const user = yield this.getUser();
            if (!user)
                return false;
            return !!user.inboxKeys;
        });
    }
    discardInboxKeys() {
        return __awaiter(this, void 0, void 0, function* () {
            this.keyManager.clearCache();
            const user = yield this.getUser();
            if (!user)
                return;
            const token = yield this.tokenManager.getAccessToken();
            yield http_js_1.default.patch.json(`${constants_js_1.default.API_HOST}${ENDPOINTS.user}`, { inboxKeys: { public: null, private: null } }, token);
            yield this.setUser(Object.assign(Object.assign({}, user), { inboxKeys: undefined }));
        });
    }
    saveInboxKeys(keys) {
        return __awaiter(this, void 0, void 0, function* () {
            const userEncryptionKey = yield this.getMasterKey();
            if (!userEncryptionKey)
                return;
            const updatePayload = {
                inboxKeys: {
                    public: keys.publicKey,
                    private: yield this.db
                        .storage()
                        .encrypt(userEncryptionKey, keys.privateKey)
                }
            };
            yield this.updateUser(updatePayload);
            this.keyManager.clearCache();
        });
    }
    sendVerificationEmail(newEmail) {
        return __awaiter(this, void 0, void 0, function* () {
            const token = yield this.tokenManager.getAccessToken();
            if (!token)
                return;
            yield http_js_1.default.post(`${constants_js_1.default.AUTH_HOST}${ENDPOINTS.verifyUser}`, { newEmail }, token);
        });
    }
    changeEmail(newEmail, password, code) {
        return __awaiter(this, void 0, void 0, function* () {
            const token = yield this.tokenManager.getAccessToken();
            if (!token)
                return;
            const user = yield this.getUser();
            if (!user)
                return;
            const email = newEmail.toLowerCase();
            try {
                yield http_js_1.default.patch(`${constants_js_1.default.AUTH_HOST}${ENDPOINTS.patchUser}`, {
                    type: "change_email",
                    new_email: newEmail,
                    password: yield this.db.storage().hash(password, email, {
                        usesFallback: yield this.usesFallbackPWHash(password)
                    }),
                    verification_code: code
                }, token);
            }
            catch (e) {
                const error = e;
                if (error.message === "Invalid token.")
                    throw new Error("Invalid code.");
                throw error;
            }
        });
    }
    recoverAccount(email) {
        return http_js_1.default.post(`${constants_js_1.default.AUTH_HOST}${ENDPOINTS.recoverAccount}`, {
            email,
            client_id: "notesnook"
        });
    }
    verifyPassword(password) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const user = yield this.getUser();
                const key = yield this.getMasterKey();
                if (!user || !key)
                    return false;
                const cipher = yield this.db.storage().encrypt(key, "notesnook");
                const plainText = yield this.db.storage().decrypt({ password }, cipher);
                return plainText === "notesnook";
            }
            catch (e) {
                logger_js_1.logger.error(e);
                return false;
            }
        });
    }
    _updatePassword(type, data) {
        return __awaiter(this, void 0, void 0, function* () {
            const token = yield this.tokenManager.getAccessToken();
            const user = yield this.getUser();
            if (!token || !user)
                throw new Error("You are not logged in.");
            const { email, salt } = user;
            const { new_password, old_password } = data;
            if (old_password && !(yield this.verifyPassword(old_password)))
                throw new Error("Incorrect old password.");
            const oldPassword = old_password
                ? // we don't lowercase email here to allow user accounts with
                    // mixed cased emails to change their passwords. Once that is done,
                    // we will lowercase the email in the backend.
                    yield this.db.storage().hash(old_password, email, {
                        usesFallback: yield this.usesFallbackPWHash(old_password)
                    })
                : null;
            if (!new_password)
                throw new Error("New password is required.");
            data.encryptionKey = data.encryptionKey || (yield this.getMasterKey());
            const updateUserPayload = {};
            if (data.encryptionKey) {
                const newMasterKey = yield this.db
                    .storage()
                    .generateCryptoKey(new_password, salt);
                if (user.attachmentsKey) {
                    updateUserPayload.attachmentsKey = yield this.keyManager.rewrapKey(user.attachmentsKey, data.encryptionKey, newMasterKey);
                }
                if (user.monographPasswordsKey) {
                    updateUserPayload.monographPasswordsKey =
                        yield this.keyManager.rewrapKey(user.monographPasswordsKey, data.encryptionKey, newMasterKey);
                }
                if (user.inboxKeys) {
                    updateUserPayload.inboxKeys = yield this.keyManager.rewrapKey(user.inboxKeys, data.encryptionKey, newMasterKey);
                }
                if (user.legacyDataEncryptionKey)
                    updateUserPayload.legacyDataEncryptionKey =
                        yield this.keyManager.rewrapKey(user.legacyDataEncryptionKey, data.encryptionKey, newMasterKey);
                if (user.dataEncryptionKey)
                    updateUserPayload.dataEncryptionKey = yield this.keyManager.rewrapKey(user.dataEncryptionKey, data.encryptionKey, newMasterKey);
                else {
                    updateUserPayload.dataEncryptionKey = yield this.keyManager.wrapKey(yield this.db.crypto().generateRandomKey(), newMasterKey);
                    updateUserPayload.legacyDataEncryptionKey =
                        yield this.keyManager.wrapKey(data.encryptionKey, newMasterKey);
                }
            }
            yield http_js_1.default.patch.json(`${constants_js_1.default.API_HOST}/users/password/${type}`, {
                oldPassword: oldPassword,
                newPassword: yield this.db
                    .storage()
                    .hash(new_password, email.toLowerCase()),
                userKeys: updateUserPayload
            }, token);
            yield this.db.storage().deriveCryptoKey({
                password: new_password,
                salt
            });
            this.keyManager.clearCache();
            yield this.setUser(Object.assign(Object.assign({}, user), updateUserPayload));
            return true;
        });
    }
    usesFallbackPWHash(password) {
        return __awaiter(this, void 0, void 0, function* () {
            const user = yield this.getUser();
            const encryptionKey = yield this.getMasterKey();
            if (!user || !encryptionKey)
                return false;
            const fallbackCryptoKey = yield this.db
                .storage()
                .generateCryptoKeyFallback(password, user.salt);
            if (!fallbackCryptoKey)
                return false;
            const cryptoKey = yield this.db
                .storage()
                .generateCryptoKey(password, user.salt);
            if (!encryptionKey.key || !fallbackCryptoKey.key || !cryptoKey.key)
                throw new Error("Failed to generate crypto keys.");
            if (fallbackCryptoKey.key !== encryptionKey.key &&
                cryptoKey.key !== encryptionKey.key)
                throw new Error("Wrong password.");
            return fallbackCryptoKey.key === encryptionKey.key;
        });
    }
}
exports.default = UserManager;
