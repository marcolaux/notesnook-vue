//#region src/types.ts
let base64_variants = /* @__PURE__ */ function(base64_variants$1) {
	base64_variants$1[base64_variants$1["ORIGINAL"] = 1] = "ORIGINAL";
	base64_variants$1[base64_variants$1["ORIGINAL_NO_PADDING"] = 3] = "ORIGINAL_NO_PADDING";
	base64_variants$1[base64_variants$1["URLSAFE"] = 5] = "URLSAFE";
	base64_variants$1[base64_variants$1["URLSAFE_NO_PADDING"] = 7] = "URLSAFE_NO_PADDING";
	return base64_variants$1;
}({});

//#endregion
export { base64_variants };