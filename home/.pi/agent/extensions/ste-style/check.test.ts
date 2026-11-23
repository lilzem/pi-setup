import { test } from "node:test";
import assert from "node:assert/strict";
import { findViolations, formatFeedback } from "./check.ts";

test("accepts short plain sentences", () => {
	assert.deepEqual(findViolations("The bug is in line 81. Run the tests."), []);
});

test("flags a descriptive sentence longer than 25 words", () => {
	const long = Array.from({ length: 26 }, (_, i) => `word${i}`).join(" ") + ".";
	const [violation] = findViolations(long);
	assert.equal(violation.kind, "long-sentence");
	assert.match(violation.detail, /26 words/);
});

test("flags a numbered step longer than 20 words", () => {
	const step = "1. " + Array.from({ length: 21 }, () => "run").join(" ") + ".";
	const [violation] = findViolations(step);
	assert.equal(violation.kind, "long-sentence");
	assert.match(violation.detail, /max 20/);
});

test("allows a numbered step of exactly 20 words", () => {
	const step = "1. " + Array.from({ length: 20 }, () => "run").join(" ") + ".";
	assert.deepEqual(findViolations(step), []);
});

test("ignores fenced code, inline code, urls and table rows", () => {
	const words = Array.from({ length: 30 }, () => "x").join(" ");
	const text = [
		"```ts",
		`const a = "${words}";`,
		"```",
		`See \`${words}\` here.`,
		`Open https://example.com/${words.replace(/ /g, "-")} now.`,
		`| ${words} |`,
	].join("\n");
	assert.deepEqual(findViolations(text), []);
});

test("flags contractions, phrasal verbs, slang and filler", () => {
	const kinds = findViolations("I'm sure we can figure out the prod bug. It just works.").map((v) => v.term);
	assert.deepEqual(kinds.sort(), ["I'm", "figure out", "just", "prod"].sort());
});

test("matches banned terms as whole words only", () => {
	assert.deepEqual(findViolations("The product and the adjustment are ready."), []);
});

test("formatFeedback lists each violation and asks for a rewrite", () => {
	const feedback = formatFeedback(findViolations("I'm here."));
	assert.match(feedback, /Simplified Technical English/);
	assert.match(feedback, /"I'm"/);
	assert.match(feedback, /Rewrite/);
});
