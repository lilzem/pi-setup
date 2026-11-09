import { test } from "node:test";
import assert from "node:assert/strict";
import { guideSection, guideTopics } from "./guide.ts";

const guide = "# Title\n\nintro\n\n## search\n\nsearch body\n\n## memory\n\nmemory body\n";

test("no topic returns the whole guide", () => {
  assert.equal(guideSection(guide, ""), guide);
});

test("a topic returns only its section", () => {
  assert.equal(guideSection(guide, "memory"), "## memory\n\nmemory body");
});

test("topic lookup ignores case and surrounding space", () => {
  assert.equal(guideSection(guide, "  SEARCH "), "## search\n\nsearch body");
});

test("an unknown topic lists the valid ones", () => {
  assert.equal(guideSection(guide, "nope"), "Unknown topic `nope`. Topics: search, memory");
});

test("lists topics in guide order", () => {
  assert.deepEqual(guideTopics(guide), ["search", "memory"]);
});
