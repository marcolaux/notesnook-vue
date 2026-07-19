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
Object.defineProperty(exports, "__esModule", { value: true });
exports.randomBytes = randomBytes;
exports.randomInt = randomInt;
const has_require_js_1 = require("./has-require.js");
function randomBytes(size) {
    const crypto = globalThis.crypto || ((0, has_require_js_1.hasRequire)() ? require("node:crypto") : null);
    if (!crypto)
        throw new Error("Crypto is not supported on this platform.");
    if ("randomBytes" in crypto && typeof crypto.randomBytes === "function")
        return crypto.randomBytes(size);
    if (!crypto.getRandomValues)
        throw new Error("Crypto.getRandomValues is not available on this platform.");
    const buffer = Buffer.alloc(size);
    crypto.getRandomValues(buffer);
    return buffer;
}
function randomInt() {
    return randomBytes(4).readInt32BE();
}
