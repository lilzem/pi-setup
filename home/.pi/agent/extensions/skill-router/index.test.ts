import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { isSkillInstalled, loadRoutesFromFile } from "./router.ts";
const TEST_SKILL_DIR = path.join(os.tmpdir(), "test-skills");
const TEST_SYNCED_DIR = path.join(os.tmpdir(), "test-skills-synced");

describe("isSkillInstalled", () => {
  beforeEach(() => {
    fs.mkdirSync(TEST_SKILL_DIR, { recursive: true });
    fs.mkdirSync(TEST_SYNCED_DIR, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(TEST_SKILL_DIR, { recursive: true, force: true });
    fs.rmSync(TEST_SYNCED_DIR, { recursive: true, force: true });
  });

  it("detects skill in direct path", () => {
    const skillPath = path.join(TEST_SKILL_DIR, "test-skill");
    fs.mkdirSync(skillPath, { recursive: true });
    fs.writeFileSync(path.join(skillPath, "SKILL.md"), "test content");

    const installed = isSkillInstalled("test-skill", [TEST_SKILL_DIR]);
    assert.strictEqual(installed, true);
  });

  it("detects skill in synced subdirectory", () => {
    const syncedSubdir = path.join(TEST_SYNCED_DIR, "synced", "abc-123");
    const skillPath = path.join(syncedSubdir, "nested-skill");
    fs.mkdirSync(skillPath, { recursive: true });
    fs.writeFileSync(path.join(skillPath, "SKILL.md"), "test content");

    const installed = isSkillInstalled("nested-skill", [TEST_SYNCED_DIR]);
    assert.strictEqual(installed, true);
  });

  it("returns false for non-existent skill", () => {
    const installed = isSkillInstalled("nonexistent", [TEST_SKILL_DIR]);
    assert.strictEqual(installed, false);
  });

  it("handles missing directories gracefully", () => {
    const installed = isSkillInstalled("any-skill", ["/nonexistent/path"]);
    assert.strictEqual(installed, false);
  });
});

describe("loadRoutesFromFile", () => {
  const TEST_ROUTES_PATH = path.join(os.tmpdir(), "test-routes.json");

  afterEach(() => {
    if (fs.existsSync(TEST_ROUTES_PATH)) {
      fs.unlinkSync(TEST_ROUTES_PATH);
    }
  });

  it("loads valid routes from file", () => {
    const routes = [{ skill: "test", patterns: ["pattern"] }];
    fs.writeFileSync(TEST_ROUTES_PATH, JSON.stringify(routes));

    const loaded = loadRoutesFromFile(TEST_ROUTES_PATH);
    assert.strictEqual(loaded.length, 1);
    assert.strictEqual(loaded[0].skill, "test");
  });

  it("returns empty array for non-existent file", () => {
    const loaded = loadRoutesFromFile("/nonexistent/file.json");
    assert.deepStrictEqual(loaded, []);
  });

  it("returns empty array for invalid JSON file", () => {
    fs.writeFileSync(TEST_ROUTES_PATH, "invalid json");

    const loaded = loadRoutesFromFile(TEST_ROUTES_PATH);
    assert.deepStrictEqual(loaded, []);
  });
});


