import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, symlink, rm, access, open } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const base = await mkdtemp(path.join(os.tmpdir(), "lg-files-"));
const repo = path.join(base, "repo");
const outside = path.join(base, "outside");
process.env.REPO_ROOT = repo; // read on every call, so set before the first one

const { preview, listDir, detail, removeEntry, renameEntry, moveEntry, FileError } = await import("../src/lib/files.ts");

const exists = (p) => access(p).then(() => true, () => false);
const blocked = FileError; // assert.rejects takes the error class itself

before(async () => {
	await mkdir(path.join(repo, "sub"), { recursive: true });
	await mkdir(path.join(repo, "output"), { recursive: true });
	await mkdir(path.join(repo, "..odd"), { recursive: true });
	await mkdir(path.join(outside, "secret"), { recursive: true });
	await writeFile(path.join(outside, "secret", "passwd"), "TOPSECRET\n");
	await writeFile(path.join(repo, "sub", "a.txt"), "hello\n");
	await writeFile(path.join(repo, "..odd", "f.txt"), "ok\n");
	await writeFile(path.join(repo, ".env"), "KEY=value\n");
	// Links that lead out of the repo, and one that stays inside it.
	await symlink(outside, path.join(repo, "linkdir"));
	await symlink(path.join(outside, "secret", "passwd"), path.join(repo, "linkfile"));
	await symlink("sub", path.join(repo, "inlink"));
});

after(() => rm(base, { recursive: true, force: true }));

test("preview reads a normal file", async () => {
	assert.equal(await preview("sub/a.txt"), "hello\n");
});

test("preview does not follow a symlink out of the repo", async () => {
	await assert.rejects(preview("linkfile"), blocked);
});

test("preview does not follow a symlinked parent directory out of the repo", async () => {
	await assert.rejects(preview("linkdir/secret/passwd"), blocked);
});

test("a symlink that stays inside the repo still works", async () => {
	assert.equal(await preview("inlink/a.txt"), "hello\n");
});

test("blocked names and parent traversal are refused", async () => {
	await assert.rejects(preview(".env"), blocked);
	await assert.rejects(preview("../outside/secret/passwd"), blocked);
});

test("a directory merely named '..odd' is not mistaken for traversal", async () => {
	assert.equal(await preview("..odd/f.txt"), "ok\n");
});

test("listDir refuses a symlinked directory that leads outside", async () => {
	await assert.rejects(listDir("linkdir"), blocked);
});

test("detail shows an outside symlink as an empty plain entry", async () => {
	const d = await detail("linkdir");
	assert.equal(d.link, true);
	assert.equal(d.dir, false);
	assert.equal(d.size, 0);
	assert.equal(d.items, undefined);
});

test("delete, rename and move refuse to act through a symlinked parent", async () => {
	const victim = path.join(outside, "secret", "passwd");
	await assert.rejects(removeEntry("linkdir/secret/passwd"), blocked);
	await assert.rejects(renameEntry("linkdir/secret", "renamed"), blocked);
	await assert.rejects(moveEntry("sub/a.txt", "linkdir"), blocked);
	assert.equal(await exists(victim), true, "the file outside the repo must still exist");
	assert.equal(await exists(path.join(repo, "sub", "a.txt")), true);
});

test("deleting a symlink removes the link and leaves its target alone", async () => {
	await removeEntry("linkfile");
	assert.equal(await exists(path.join(repo, "linkfile")), false);
	assert.equal(await exists(path.join(outside, "secret", "passwd")), true);
});

test("preview reads only the first chunk of a huge file", async () => {
	const big = path.join(repo, "output", "huge.txt");
	const fh = await open(big, "w");
	await fh.write("start of file\n");
	await fh.truncate(400 * 1024 * 1024); // sparse: costs no disk
	await fh.close();

	const before = process.memoryUsage().arrayBuffers;
	await preview("output/huge.txt"); // NUL bytes: ends up binary, but must not load the file first
	const grown = process.memoryUsage().arrayBuffers - before;
	assert.ok(grown < 20 * 1024 * 1024, `preview allocated ${Math.round(grown / 1e6)} MB for a 400 MB file`);
});

test("preview truncates long text and says how much was left out", async () => {
	await writeFile(path.join(repo, "output", "long.txt"), "a".repeat(200_000));
	const text = await preview("output/long.txt", 1000);
	assert.ok(text.startsWith("a".repeat(1000)));
	assert.match(text, /199000 byte lagi tidak ditampilkan/);
});

test("preview treats binary content as not previewable", async () => {
	await writeFile(path.join(repo, "output", "x.bin"), Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0xff]));
	assert.equal(await preview("output/x.bin"), null);
});
