//#region rolldown:runtime
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
	if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
		key = keys[i];
		if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
			get: ((k) => from[k]).bind(null, key),
			enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
		});
	}
	return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", {
	value: mod,
	enumerable: true
}) : target, mod));

//#endregion

//#region src/types.ts
let base64_variants = /* @__PURE__ */ function(base64_variants$1) {
	base64_variants$1[base64_variants$1["ORIGINAL"] = 1] = "ORIGINAL";
	base64_variants$1[base64_variants$1["ORIGINAL_NO_PADDING"] = 3] = "ORIGINAL_NO_PADDING";
	base64_variants$1[base64_variants$1["URLSAFE"] = 5] = "URLSAFE";
	base64_variants$1[base64_variants$1["URLSAFE_NO_PADDING"] = 7] = "URLSAFE_NO_PADDING";
	return base64_variants$1;
}({});

//#endregion
Object.defineProperty(exports, '__toESM', {
  enumerable: true,
  get: function () {
    return __toESM;
  }
});
Object.defineProperty(exports, 'base64_variants', {
  enumerable: true,
  get: function () {
    return base64_variants;
  }
});