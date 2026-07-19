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
import { isCipher } from "../utils/index.js";
const KEY_INFO = {
    inboxKeys: {
        type: "asymmetric"
    },
    attachmentsKey: {
        type: "symmetric"
    },
    monographPasswordsKey: {
        type: "symmetric"
    },
    dataEncryptionKey: {
        type: "symmetric"
    },
    legacyDataEncryptionKey: {
        type: "symmetric"
    }
};
export class KeyManager {
    constructor(db) {
        this.db = db;
        this.cache = new Map();
    }
    clearCache() {
        this.cache.clear();
    }
    get(id_1) {
        return __awaiter(this, arguments, void 0, function* (id, options = { refetchUser: true, useCache: true }) {
            const cachedKey = this.cache.get(id);
            if (options.useCache && cachedKey) {
                return cachedKey;
            }
            let user = yield this.db.user.getUser();
            if ((!user || !user[id]) && options.refetchUser) {
                user = yield this.db.user.fetchUser();
            }
            if (!user)
                return;
            const key = user[id];
            if (key)
                this.cache.set(id, key);
            return key;
        });
    }
    unwrapKey(key, wrappingKey) {
        return __awaiter(this, void 0, void 0, function* () {
            if (isCipher(key))
                return JSON.parse(yield this.db.storage().decrypt(wrappingKey, key));
            else {
                const privateKey = yield this.db
                    .storage()
                    .decrypt(wrappingKey, key.private);
                return {
                    publicKey: key.public,
                    privateKey
                };
            }
        });
    }
    wrapKey(key, wrappingKey) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!("publicKey" in key)) {
                return (yield this.db
                    .storage()
                    .encrypt(wrappingKey, JSON.stringify(key)));
            }
            else {
                const encryptedPrivateKey = yield this.db
                    .storage()
                    .encrypt(wrappingKey, key.privateKey);
                return {
                    public: key.publicKey,
                    private: encryptedPrivateKey
                };
            }
        });
    }
    rewrapKey(key, oldWrappingKey, newWrappingKey) {
        return __awaiter(this, void 0, void 0, function* () {
            const unwrappedKey = yield this.unwrapKey(key, oldWrappingKey);
            return yield this.wrapKey(unwrappedKey, newWrappingKey);
        });
    }
}
