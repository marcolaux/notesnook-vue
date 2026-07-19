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
import { randomBytes } from "./random.js";
export class Crypto {
    constructor(storage) {
        this.storage = storage;
    }
    generateRandomKey() {
        return __awaiter(this, void 0, void 0, function* () {
            const passwordBytes = randomBytes(124);
            const password = passwordBytes.toString("base64");
            return yield this.storage().generateCryptoKey(password);
        });
    }
    generatePGPKeyPair() {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.storage().generatePGPKeyPair();
        });
    }
}
export function isCipher(item) {
    return (item !== null &&
        typeof item === "object" &&
        "cipher" in item &&
        "iv" in item &&
        "salt" in item);
}
