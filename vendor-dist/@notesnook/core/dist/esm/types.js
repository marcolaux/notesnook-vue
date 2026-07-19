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
import { isCipher } from "./utils/index.js";
export const GroupingKey = [
    "home",
    "notes",
    "notebooks",
    "tags",
    "trash",
    "favorites",
    "reminders",
    "archive",
    "search"
];
export var SubscriptionPlan;
(function (SubscriptionPlan) {
    SubscriptionPlan[SubscriptionPlan["FREE"] = 0] = "FREE";
    SubscriptionPlan[SubscriptionPlan["ESSENTIAL"] = 1] = "ESSENTIAL";
    SubscriptionPlan[SubscriptionPlan["PRO"] = 2] = "PRO";
    SubscriptionPlan[SubscriptionPlan["BELIEVER"] = 3] = "BELIEVER";
    SubscriptionPlan[SubscriptionPlan["EDUCATION"] = 4] = "EDUCATION";
    SubscriptionPlan[SubscriptionPlan["LEGACY_PRO"] = 5] = "LEGACY_PRO";
})(SubscriptionPlan || (SubscriptionPlan = {}));
export var SubscriptionStatus;
(function (SubscriptionStatus) {
    SubscriptionStatus[SubscriptionStatus["ACTIVE"] = 0] = "ACTIVE";
    SubscriptionStatus[SubscriptionStatus["TRIAL"] = 1] = "TRIAL";
    SubscriptionStatus[SubscriptionStatus["CANCELED"] = 2] = "CANCELED";
    SubscriptionStatus[SubscriptionStatus["PAUSED"] = 3] = "PAUSED";
    SubscriptionStatus[SubscriptionStatus["EXPIRED"] = 4] = "EXPIRED";
})(SubscriptionStatus || (SubscriptionStatus = {}));
export var SubscriptionProvider;
(function (SubscriptionProvider) {
    SubscriptionProvider[SubscriptionProvider["STREETWRITERS"] = 0] = "STREETWRITERS";
    SubscriptionProvider[SubscriptionProvider["APPLE"] = 1] = "APPLE";
    SubscriptionProvider[SubscriptionProvider["GOOGLE"] = 2] = "GOOGLE";
    SubscriptionProvider[SubscriptionProvider["PADDLE"] = 3] = "PADDLE";
    SubscriptionProvider[SubscriptionProvider["GIFT_CARD"] = 4] = "GIFT_CARD";
})(SubscriptionProvider || (SubscriptionProvider = {}));
export function isDeleted(item) {
    return !!item.deleted && item.type !== "trash";
}
export function isTrashItem(item) {
    return item.type === "trash";
}
export function isGroupHeader(item) {
    return item.type === "header";
}
export function isGroupingKey(key) {
    return GroupingKey.includes(key);
}
export function isDecryptedContent(content) {
    return !isCipher(content.data);
}
export function isEncryptedContent(content) {
    return isCipher(content.data);
}
export function planToId(plan) {
    switch (plan) {
        case SubscriptionPlan.FREE:
            return "free";
        case SubscriptionPlan.BELIEVER:
            return "believer";
        case SubscriptionPlan.EDUCATION:
            return "education";
        case SubscriptionPlan.ESSENTIAL:
            return "essential";
        case SubscriptionPlan.PRO:
            return "pro";
        case SubscriptionPlan.LEGACY_PRO:
            return "legacyPro";
    }
}
