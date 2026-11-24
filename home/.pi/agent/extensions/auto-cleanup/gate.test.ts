import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
	gateGitCommand,
	isGitCommitOrPush,
	snapshot,
	modifiedSince,
} from "./gate.ts";

test("detects git commit and push commands", () => {
	assert.equal(isGitCommitOrPush("git commit -m 'x'"), true);
	assert.equal(isGitCommitOrPush("cd repo && git add -A && git commit -q -m x"), true);
	assert.equal(isGitCommitOrPush("git -C ~/pi-setup push"), true);
	assert.equal(isGitCommitOrPush("git push -q origin main"), true);
	assert.equal(isGitCommitOrPush("git status && git log --oneline -1"), false);
	assert.equal(isGitCommitOrPush("echo commit push"), false);
});

test("snapshot reports only the files whose content changed", () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gate-"));
	const a = path.join(dir, "a.ts");
	const b = path.join(dir, "b.ts");
	fs.writeFileSync(a, "1");
	fs.writeFileSync(b, "1");
	const before = snapshot([a, b, path.join(dir, "missing.ts")]);
	fs.writeFileSync(a, "2");
	assert.deepEqual(modifiedSince(before), [a]);
});

function deps(overrides: Partial<Parameters<typeof gateGitCommand>[1]> = {}) {
	const calls: string[] = [];
	const notes: string[] = [];
	return {
		calls,
		notes,
		deps: {
			activeRun: () => null,
			runPending: async () => {
				calls.push("runPending");
			},
			drainChanged: () => [],
			notify: (m: string) => notes.push(m),
			...overrides,
		},
	};
}

test("ignores commands that are not commit or push", async () => {
	const { deps: d, calls } = deps();
	assert.equal(await gateGitCommand("git status", d), undefined);
	assert.deepEqual(calls, []);
});

test("allows the commit when cleanup changes nothing", async () => {
	const { deps: d, calls } = deps();
	assert.equal(await gateGitCommand("git commit -m x", d), undefined);
	assert.deepEqual(calls, ["runPending"]);
});

test("waits for the active cleanup run before it runs pending cleanup", async () => {
	const order: string[] = [];
	let finish!: () => void;
	const active = new Promise<void>((resolve) => {
		finish = () => {
			order.push("active done");
			resolve();
		};
	});
	const { deps: d } = deps({
		activeRun: () => active,
		runPending: async () => {
			order.push("runPending");
		},
	});
	const gate = gateGitCommand("git commit -m x", d);
	setTimeout(finish, 10);
	await gate;
	assert.deepEqual(order, ["active done", "runPending"]);
});

test("blocks the commit and names the files when cleanup changed them", async () => {
	const { deps: d } = deps({
		drainChanged: () => ["/repo/a.ts", "/repo/b.ts"],
	});
	const result = await gateGitCommand("git commit -m x", d);
	assert.equal(result?.block, true);
	assert.match(result!.reason, /\/repo\/a\.ts/);
	assert.match(result!.reason, /\/repo\/b\.ts/);
	assert.match(result!.reason, /run the same git command again/);
});
