import { test } from "node:test";
import assert from "node:assert/strict";
import { canonicalSdk, targetSupported } from "../src/lib/targets.ts";

test("canonicalSdk accepts plain decimal sdk numbers", () => {
	for (const ok of ["24", "29", "36", "37"]) assert.equal(canonicalSdk(ok), ok);
});

test("canonicalSdk rejects every spelling that Number() would still read as a number", () => {
	// All of these are 36 to Number(), which is how they once got through.
	for (const bad of [" 36 ", "36 ", " 36", "\n36", "36\n", "0x24", "3.6e1", "036", "+36", "36.0", "٣٦"]) {
		assert.equal(canonicalSdk(bad), "", `should reject ${JSON.stringify(bad)}`);
	}
});

test("canonicalSdk rejects junk and empty input", () => {
	for (const bad of ["", "abc", "36 ../x", "36;ls", "-1", "0", "1234"]) {
		assert.equal(canonicalSdk(bad), "", `should reject ${JSON.stringify(bad)}`);
	}
	assert.equal(canonicalSdk(undefined), "");
});

test("targetSupported follows the per-arch limits", () => {
	assert.equal(targetSupported("arm64", 37), true);
	assert.equal(targetSupported("x86_64", 37), true);
	assert.equal(targetSupported("arm", 36), true);
	assert.equal(targetSupported("arm", 37), false, "arm (32-bit) stops at SDK 36");
	assert.equal(targetSupported("x86", 30), true);
	assert.equal(targetSupported("x86", 31), false, "x86 (32-bit) stops at SDK 30");
	assert.equal(targetSupported("arm64", 23), false, "below SDK 24 is no longer built");
	assert.equal(targetSupported("arm64", 24), true);
});
