/*
 * Brute-force throttle for the login form.
 *
 * Failed attempts are counted per key inside a sliding window; once a key has
 * MAX_FAILS failures in WINDOW_MS it is locked until the oldest of them ages
 * out. The state lives in memory: the panel is one Node process with one
 * admin account, so a database table would add a schema and a query to every
 * login for no gain. A restart clears it, which only helps an attacker who can
 * already restart the panel.
 *
 * login() checks two keys at once - the client address and the username - so
 * guessing one account from many addresses and guessing many accounts from
 * one address are both slowed down.
 */

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = 5;
// Hard cap on tracked keys so a flood of made-up usernames cannot grow the map
// without bound; the oldest entries are dropped first.
const MAX_KEYS = 5000;

const fails = new Map<string, number[]>();

function fresh(key: string, now: number): number[] {
	const list = (fails.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
	if (list.length) fails.set(key, list);
	else fails.delete(key);
	return list;
}

/** Seconds until the first locked key frees up, or 0 when none is locked. */
export function lockedFor(keys: string[]): number {
	const now = Date.now();
	let wait = 0;
	for (const key of keys) {
		const list = fresh(key, now);
		if (list.length >= MAX_FAILS) {
			wait = Math.max(wait, Math.ceil((list[0] + WINDOW_MS - now) / 1000));
		}
	}
	return wait;
}

export function recordFailure(keys: string[]): void {
	const now = Date.now();
	for (const key of keys) {
		const list = fresh(key, now);
		list.push(now);
		fails.set(key, list);
	}
	while (fails.size > MAX_KEYS) {
		const oldest = fails.keys().next().value;
		if (oldest === undefined) break;
		fails.delete(oldest);
	}
}

export function recordSuccess(keys: string[]): void {
	for (const key of keys) fails.delete(key);
}

/*
 * Key for the caller's address. Behind a reverse proxy the real address is in
 * X-Forwarded-For, but that header is plain text any client can set, so it is
 * trusted only when the operator says a proxy sets it (TRUST_PROXY=1).
 * Otherwise every caller shares one "direct" key, which still caps the total
 * guessing rate - it just cannot tell clients apart.
 */
export function clientKey(forwardedFor: string | null): string {
	if (process.env.TRUST_PROXY === "1" && forwardedFor) {
		// The proxy appends the real peer last; earlier entries are client-supplied.
		const parts = forwardedFor.split(",").map((p) => p.trim()).filter(Boolean);
		const ip = parts[parts.length - 1];
		if (ip) return `ip:${ip.slice(0, 64)}`;
	}
	return "ip:direct";
}

export function userKey(username: string): string {
	return `user:${username.toLowerCase().slice(0, 64)}`;
}
