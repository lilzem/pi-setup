import { describe, it } from "node:test";
import assert from "node:assert";
import {
  loadRoutes,
  loadRoutesFromFile,
  matchSkills,
  type SkillRoute,
} from "./router.ts";

describe("loadRoutes", () => {
  it("parses valid JSON and compiles regexes", () => {
    const json = JSON.stringify([
      { skill: "test-skill", patterns: ["\\btest\\b", "hello"] },
    ]);
    const routes = loadRoutes(json);
    assert.strictEqual(routes.length, 1);
    assert.strictEqual(routes[0].skill, "test-skill");
    assert.strictEqual(routes[0].regexes.length, 2);
  });

  it("returns empty array for invalid JSON", () => {
    const routes = loadRoutes("{not valid json");
    assert.deepStrictEqual(routes, []);
  });

  it("skips routes with invalid regex patterns", () => {
    const json = JSON.stringify([
      { skill: "good", patterns: ["\\bvalid\\b"] },
      { skill: "bad", patterns: ["(unclosed"] },
      { skill: "also-good", patterns: ["ok"] },
    ]);
    const routes = loadRoutes(json);
    assert.strictEqual(routes.length, 2);
    assert.strictEqual(routes[0].skill, "good");
    assert.strictEqual(routes[1].skill, "also-good");
  });

  it("returns empty array for malformed route objects", () => {
    const json = JSON.stringify([
      { skill: "no-patterns" },
      { patterns: ["test"] },
      "not an object",
    ]);
    const routes = loadRoutes(json);
    assert.deepStrictEqual(routes, []);
  });
});

describe("matchSkills", () => {
  const routes: SkillRoute[] = [
    {
      skill: "github",
      regexes: [/\bPR\s*#?\d+/i, /github\.com\/[^\s]+\/(pull|issues)\/\d+/i],
    },
    {
      skill: "youtrack",
      regexes: [/\b[A-Z]{2,10}-\d+\b/, /youtrack/i],
    },
    {
      skill: "css-skill",
      regexes: [/\bcss\b/i, /\bhtml\b/i],
    },
  ];

  it("matches case-insensitively", () => {
    const matched = matchSkills("Check PR #123 please", routes);
    assert.deepStrictEqual(matched, ["github"]);
  });

  it("matches multiple skills", () => {
    const matched = matchSkills(
      "See DEV-456 and also PR #789 for CSS changes",
      routes,
    );
    assert.deepStrictEqual(matched.sort(), ["css-skill", "github", "youtrack"].sort());
  });

  it("returns empty array for no matches", () => {
    const matched = matchSkills("No special keywords here", routes);
    assert.deepStrictEqual(matched, []);
  });

  it("matches each skill at most once", () => {
    const matched = matchSkills("CSS and HTML and more CSS", routes);
    assert.deepStrictEqual(matched, ["css-skill"]);
  });

  it("skips prompts starting with slash", () => {
    const matched = matchSkills("/test PR #123", routes);
    assert.deepStrictEqual(matched, []);
  });

  it("handles empty routes array", () => {
    const matched = matchSkills("Any prompt", []);
    assert.deepStrictEqual(matched, []);
  });

  it("handles empty prompt", () => {
    const matched = matchSkills("", routes);
    assert.deepStrictEqual(matched, []);
  });
});

describe("shipped skill-routes.json", () => {
  const routes = loadRoutesFromFile(new URL("./skill-routes.json", import.meta.url).pathname);

  it("routes uppercase issue ids to youtrack", () => {
    assert.deepStrictEqual(matchSkills("look at DEV-4659", routes), ["youtrack"]);
  });

  it("ignores lowercase or standard ids that look like issue ids", () => {
    for (const prompt of ["convert to utf-8", "parse ISO-8601 dates", "target es-2020", "fix CVE-2024 and SHA-256"]) {
      assert.deepStrictEqual(matchSkills(prompt, routes), [], prompt);
    }
  });

  it("does not treat plain copying as copywriting", () => {
    assert.deepStrictEqual(matchSkills("copy the file into dist", routes), []);
    assert.deepStrictEqual(matchSkills("rewrite the microcopy on the button", routes), ["plain-copy"]);
  });
});
