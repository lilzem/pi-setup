import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { syncSessions } from "./sync.ts";

const header = (id: string) =>
  JSON.stringify({ type: "session", version: 3, id, timestamp: "2026-09-14T13:00:31.078Z", cwd: "/proj" });
const userLine = JSON.stringify({ type: "message", timestamp: "2026-09-14T13:00:32.000Z", message: { role: "user", content: "hi" } });

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cal-sync-"));
  const sessions = path.join(root, "pi-sessions");
  const out = path.join(root, "codex-home");
  fs.mkdirSync(path.join(sessions, "--proj--"), { recursive: true });
  fs.writeFileSync(path.join(sessions, "--proj--", "a.jsonl"), `${header("aaaa")}\n${userLine}\n`);
  fs.writeFileSync(path.join(sessions, "--proj--", "broken.jsonl"), "no header here\n");
  return { sessions, out, rollout: path.join(out, "sessions/2026/09/14/rollout-2026-09-14T13-00-31-aaaa.jsonl") };
}

test("writes one rollout per convertible pi session", () => {
  const { sessions, out, rollout } = fixture();
  assert.deepEqual(syncSessions(sessions, out), { written: 1, skipped: 1 });
  assert.equal(fs.readFileSync(rollout, "utf8").trim().split("\n").length, 2);
});

test("is idempotent: an unchanged session is not rewritten", () => {
  const { sessions, out } = fixture();
  syncSessions(sessions, out);
  assert.deepEqual(syncSessions(sessions, out), { written: 0, skipped: 2 });
});

test("a mirror with the same mtime as its source counts as fresh", () => {
  const { sessions, out, rollout } = fixture();
  syncSessions(sessions, out);
  const stamp = new Date("2026-01-01T00:00:00Z");
  fs.utimesSync(path.join(sessions, "--proj--", "a.jsonl"), stamp, stamp);
  fs.utimesSync(rollout, stamp, stamp);
  assert.equal(syncSessions(sessions, out).written, 0);
});

test("rewrites a session that grew since the last sync", () => {
  const { sessions, out, rollout } = fixture();
  syncSessions(sessions, out);
  const src = path.join(sessions, "--proj--", "a.jsonl");
  fs.appendFileSync(src, `${userLine}\n`);
  const later = new Date(Date.now() + 5000);
  fs.utimesSync(src, later, later);
  assert.equal(syncSessions(sessions, out).written, 1);
  assert.equal(fs.readFileSync(rollout, "utf8").trim().split("\n").length, 3);
});

test("treats a missing sessions folder as nothing to do", () => {
  assert.deepEqual(syncSessions("/no/such/dir", fs.mkdtempSync(path.join(os.tmpdir(), "cal-out-"))), { written: 0, skipped: 0 });
});
