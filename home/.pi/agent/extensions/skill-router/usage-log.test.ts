import { describe, it, afterEach } from "node:test";
import assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { createUsageTracker, appendUsageLog } from "./usage-log.ts";

describe("createUsageTracker", () => {
  it("reports a suggested skill as loaded after its SKILL.md is read", () => {
    const tracker = createUsageTracker();
    tracker.suggest(["bouncer", "github"]);
    tracker.observeRead("/Users/x/.claude/skills/bouncer/SKILL.md");

    assert.deepStrictEqual(tracker.flush(), [
      { skill: "bouncer", loaded: true },
      { skill: "github", loaded: false },
    ]);
  });

  it("ignores reads of other files in the skill directory", () => {
    const tracker = createUsageTracker();
    tracker.suggest(["bouncer"]);
    tracker.observeRead("/s/bouncer/references/check.md");
    tracker.observeRead("/s/not-bouncer/SKILL.md");

    assert.deepStrictEqual(tracker.flush(), [{ skill: "bouncer", loaded: false }]);
  });

  it("empties after flush", () => {
    const tracker = createUsageTracker();
    tracker.suggest(["bouncer"]);
    tracker.flush();

    assert.deepStrictEqual(tracker.flush(), []);
  });
});

describe("appendUsageLog", () => {
  const dir = path.join(os.tmpdir(), "skill-router-log-test");
  const file = path.join(dir, "nested", "log.jsonl");

  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("appends one JSON line per entry with a timestamp", () => {
    const now = new Date("2026-11-26T10:00:00Z");
    appendUsageLog(file, [{ skill: "a", loaded: true }], now);
    appendUsageLog(file, [{ skill: "b", loaded: false }], now);

    const lines = fs.readFileSync(file, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    assert.deepStrictEqual(lines, [
      { ts: "2026-11-26T10:00:00.000Z", skill: "a", loaded: true },
      { ts: "2026-11-26T10:00:00.000Z", skill: "b", loaded: false },
    ]);
  });

  it("writes nothing for no entries", () => {
    appendUsageLog(file, [], new Date());

    assert.strictEqual(fs.existsSync(file), false);
  });
});
