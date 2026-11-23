import { test } from "node:test";
import assert from "node:assert/strict";
import steStyleExtension from "./index.ts";

type Handler = (event: any, ctx: any) => Promise<any>;

function load() {
	const handlers = new Map<string, Handler>();
	steStyleExtension({ on: (name: string, handler: Handler) => handlers.set(name, handler) } as any);
	const ctx = { hasUI: false };
	return {
		start: () => handlers.get("before_agent_start")!({ systemPrompt: "BASE", messageType: "user" }, ctx),
		finish: (text: string, toolResults: unknown[] = [], extraParts: unknown[] = []) =>
			handlers.get("turn_end")!(
				{
					outcome: "completed",
					toolResults,
					messageEntryId: "m1",
					entries: [],
					message: { role: "assistant", content: [{ type: "text", text }, ...extraParts] },
				},
				ctx,
			),
	};
}

test("adds the STE rule to the system prompt", async () => {
	const result = await load().start();
	assert.match(result.systemPrompt, /^BASE/);
	assert.match(result.systemPrompt, /Simplified Technical English/);
});

test("accepts a clean final reply", async () => {
	const ext = load();
	await ext.start();
	assert.equal(await ext.finish("The fix is correct."), undefined);
});

test("asks for one rewrite of a bad final reply", async () => {
	const ext = load();
	await ext.start();
	const result = await ext.finish("I'm sure it works.");
	assert.equal(result.continue, true);
	assert.equal(result.entries.length, 1);
	assert.match(result.entries[0].content, /"I'm"/);
	assert.equal(result.entries[0].display, false);
});

test("asks for only one rewrite per user prompt", async () => {
	const ext = load();
	await ext.start();
	await ext.finish("I'm sure it works.");
	assert.equal(await ext.finish("I'm still sure."), undefined);
	await ext.start();
	assert.ok(await ext.finish("I'm sure again."));
});

test("checks a reply when no user prompt started the run", async () => {
	assert.ok(await load().finish("I'm sure."));
});

test("checks only text parts of the reply", async () => {
	const ext = load();
	await ext.start();
	const thinking = { type: "thinking", thinking: "I'm thinking.", text: "I'm thinking." };
	assert.equal(await ext.finish("The fix is correct.", [], [thinking]), undefined);
});

test("checks every text part of the reply", async () => {
	const ext = load();
	await ext.start();
	assert.ok(await ext.finish("The fix is correct.", [], [{ type: "text", text: "I'm sure." }]));
});

test("ignores turns that called tools", async () => {
	const ext = load();
	await ext.start();
	assert.equal(await ext.finish("I'm reading files.", [{}]), undefined);
});
