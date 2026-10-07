import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { clientKey, lockedFor, recordFailure, recordSuccess, userKey } from "../src/lib/loginlimit.ts";

let n = 0;
let keys;
beforeEach(() => {
	// The limiter is module-level state, so every test gets keys of its own.
	n += 1;
	keys = [`ip:test${n}`, userKey(`user${n}`)];
});

test("four failures are tolerated, the fifth locks for about 15 minutes", () => {
	for (let i = 0; i < 4; i++) recordFailure(keys);
	assert.equal(lockedFor(keys), 0);
	recordFailure(keys);
	const wait = lockedFor(keys);
	assert.ok(wait > 14 * 60 && wait <= 15 * 60, `wait was ${wait}s`);
});

test("a lock on either key is enough", () => {
	for (let i = 0; i < 5; i++) recordFailure([keys[1]]);
	assert.ok(lockedFor(keys) > 0, "locked by the username key alone");
	assert.equal(lockedFor([keys[0]]), 0, "the address key is untouched");
});

test("usernames are matched case-insensitively", () => {
	for (let i = 0; i < 5; i++) recordFailure([userKey("Admin")]);
	assert.ok(lockedFor([userKey("ADMIN")]) > 0);
});

test("a successful login clears the keys", () => {
	for (let i = 0; i < 5; i++) recordFailure(keys);
	recordSuccess(keys);
	assert.equal(lockedFor(keys), 0);
});

test("the lock expires once the window has passed", (t) => {
	t.mock.timers.enable({ apis: ["Date"], now: 1_000_000 });
	for (let i = 0; i < 5; i++) recordFailure(keys);
	assert.ok(lockedFor(keys) > 0);
	t.mock.timers.tick(15 * 60 * 1000 + 1);
	assert.equal(lockedFor(keys), 0);
});

test("the oldest keys are dropped once the map is full", () => {
	for (let i = 0; i < 5; i++) recordFailure(["user:victim"]);
	assert.ok(lockedFor(["user:victim"]) > 0);
	for (let i = 0; i < 5100; i++) recordFailure([`user:flood${i}`]);
	assert.equal(lockedFor(["user:victim"]), 0, "oldest entry evicted by the 5000-key cap");
});

test("X-Forwarded-For is ignored unless TRUST_PROXY=1", () => {
	const saved = process.env.TRUST_PROXY;
	try {
		process.env.TRUST_PROXY = "";
		assert.equal(clientKey("1.2.3.4"), "ip:direct");
		process.env.TRUST_PROXY = "1";
		assert.equal(clientKey("6.6.6.6, 9.9.9.9"), "ip:9.9.9.9", "last hop, not the client-supplied first one");
		assert.equal(clientKey(null), "ip:direct");
	} finally {
		if (saved === undefined) delete process.env.TRUST_PROXY;
		else process.env.TRUST_PROXY = saved;
	}
});
