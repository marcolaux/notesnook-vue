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
exports.EventManager = void 0;
class EventManager {
    constructor() {
        this._registry = new Map();
    }
    unsubscribeAll() {
        this._registry.clear();
    }
    subscribeMulti(names, handler, thisArg) {
        return names.map((name) => this.subscribe(name, handler.bind(thisArg)));
    }
    subscribe(name, handler, once = false) {
        if (!name || !handler)
            throw new Error("name and handler are required.");
        this._registry.set(handler, { name, once });
        return { unsubscribe: () => this.unsubscribe(name, handler) };
    }
    subscribeSingle(name, handler) {
        if (!name || !handler)
            throw new Error("name and handler are required.");
        this._registry.forEach((props, handler) => {
            if (props.name === name)
                this._registry.delete(handler);
        });
        this._registry.set(handler, { name, once: false });
        return { unsubscribe: () => this.unsubscribe(name, handler) };
    }
    unsubscribe(_name, handler) {
        return this._registry.delete(handler);
    }
    publish(name, ...args) {
        this._registry.forEach((props, handler) => {
            if (props.name === name) {
                handler(...args);
                if (props.once)
                    this._registry.delete(handler);
            }
        });
    }
    publishWithResult(name, ...args) {
        return __awaiter(this, void 0, void 0, function* () {
            const handlers = [];
            this._registry.forEach((props, handler) => {
                if (props.name === name) {
                    handlers.push(handler);
                    if (props.once)
                        this._registry.delete(handler);
                }
            });
            if (handlers.length <= 0)
                return true;
            return yield Promise.all(handlers.map((handler) => handler(...args)));
        });
    }
    remove(...names) {
        this._registry.forEach((props, handler) => {
            if (names.includes(props.name))
                this._registry.delete(handler);
        });
    }
}
exports.EventManager = EventManager;
exports.default = EventManager;
