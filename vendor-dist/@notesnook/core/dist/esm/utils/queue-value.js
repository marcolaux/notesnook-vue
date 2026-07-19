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
var __classPrivateFieldSet = (this && this.__classPrivateFieldSet) || function (receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return (kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value)), value;
};
var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _QueueValue_counter;
export class QueueValue {
    constructor(value, destructor) {
        this.value = value;
        this.destructor = destructor;
        _QueueValue_counter.set(this, void 0);
        __classPrivateFieldSet(this, _QueueValue_counter, 0, "f");
    }
    use() {
        var _a;
        __classPrivateFieldSet(this, _QueueValue_counter, (_a = __classPrivateFieldGet(this, _QueueValue_counter, "f"), _a++, _a), "f");
        return this.value;
    }
    discard() {
        var _a;
        __classPrivateFieldSet(this, _QueueValue_counter, (_a = __classPrivateFieldGet(this, _QueueValue_counter, "f"), _a--, _a), "f");
        if (__classPrivateFieldGet(this, _QueueValue_counter, "f") === 0)
            this.destructor();
    }
}
_QueueValue_counter = new WeakMap();
