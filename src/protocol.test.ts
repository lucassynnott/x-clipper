import test from "node:test";
import assert from "node:assert/strict";
import { getProtocolClipUrl } from "./protocol.ts";

test("accepts a URL passed to the x-clipper protocol", () => {
	assert.equal(
		getProtocolClipUrl({ url: "https://x.com/Write/status/1765884209527394325" }),
		"https://x.com/Write/status/1765884209527394325"
	);
});

test("extracts an X URL from Android shared text", () => {
	assert.equal(
		getProtocolClipUrl({ text: "Worth reading https://x.com/Write/status/1765884209527394325" }),
		"https://x.com/Write/status/1765884209527394325"
	);
});

test("rejects unrelated URLs", () => {
	assert.equal(getProtocolClipUrl({ url: "https://example.com/not-x" }), null);
});
