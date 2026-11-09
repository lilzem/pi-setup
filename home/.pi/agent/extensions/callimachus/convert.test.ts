import { test } from "node:test";
import assert from "node:assert/strict";
import { toRollout, rolloutRelativePath } from "./convert.ts";

const session = [
  { type: "session", version: 3, id: "01a0a001-3de5-76db-9cb6-009607f0d824", timestamp: "2026-09-14T13:00:31.078Z", cwd: "/proj" },
  { type: "model_change", id: "a", parentId: null, timestamp: "2026-09-14T13:00:31.100Z", provider: "anthropic", modelId: "claude-opus-5-5" },
  { type: "message", id: "b", parentId: "a", timestamp: "2026-09-14T13:00:32.000Z", message: { role: "user", content: [{ type: "text", text: "fix the login bug" }] } },
  {
    type: "message", id: "c", parentId: "b", timestamp: "2026-09-14T13:00:33.000Z",
    message: {
      role: "assistant",
      content: [
        { type: "thinking", thinking: "secret reasoning" },
        { type: "text", text: "Looking at auth.ts" },
        { type: "toolCall", id: "t1", name: "bash", arguments: { command: "rg login" } },
      ],
    },
  },
  { type: "message", id: "d", parentId: "c", timestamp: "2026-09-14T13:00:34.000Z", message: { role: "toolResult", toolCallId: "t1", toolName: "bash", isError: false, content: [{ type: "text", text: "auth.ts:12" }] } },
  { type: "compaction", id: "e", parentId: "d", timestamp: "2026-09-14T13:00:35.000Z", summary: "summary text" },
].map((o) => JSON.stringify(o));

const rollout = () => toRollout(session)!.lines.map((l) => JSON.parse(l));

test("opens with a Codex session_meta carrying the pi session id and cwd", () => {
  assert.deepEqual(rollout()[0], {
    timestamp: "2026-09-14T13:00:31.078Z",
    type: "session_meta",
    payload: { id: "01a0a001-3de5-76db-9cb6-009607f0d824", cwd: "/proj", timestamp: "2026-09-14T13:00:31.078Z", originator: "pi" },
  });
});

test("maps model changes to turn_context", () => {
  assert.deepEqual(rollout()[1].payload, { cwd: "/proj", model: "claude-opus-5-5" });
});

test("maps user and assistant text, tool calls and tool results, dropping thinking and compaction", () => {
  const payloads = rollout().slice(2).map((l) => l.payload);
  assert.deepEqual(payloads, [
    { type: "message", role: "user", content: [{ type: "input_text", text: "fix the login bug" }] },
    { type: "message", role: "assistant", content: [{ type: "output_text", text: "Looking at auth.ts" }] },
    { type: "function_call", name: "bash", arguments: '{"command":"rg login"}', call_id: "t1" },
    { type: "function_call_output", call_id: "t1", output: "auth.ts:12" },
  ]);
});

test("accepts plain-string message content", () => {
  const lines = [session[0], JSON.stringify({ type: "message", timestamp: "t", message: { role: "user", content: "hello" } })];
  assert.deepEqual(JSON.parse(toRollout(lines)!.lines[1]).payload.content, [{ type: "input_text", text: "hello" }]);
});

const payloadsOf = (...entries: object[]) =>
  toRollout([session[0], ...entries.map((e) => JSON.stringify(e))])!.lines.slice(1).map((l) => JSON.parse(l).payload);

test("drops empty and non-text blocks instead of emitting empty messages", () => {
  assert.deepEqual(
    payloadsOf(
      { type: "message", message: { role: "user", content: [{ type: "text", text: "" }, { type: "image" }] } },
      { type: "message", message: { role: "assistant", content: [{ type: "text", text: "" }] } },
    ),
    [],
  );
});

test("ignores model changes without a model and message entries without a message", () => {
  assert.deepEqual(payloadsOf({ type: "model_change" }, { type: "message" }, { type: "message", message: { role: "system" } }), []);
});

test("a tool call without arguments gets an empty JSON object", () => {
  assert.deepEqual(payloadsOf({ type: "message", message: { role: "assistant", content: [{ type: "toolCall", id: "x", name: "ls" }] } }), [
    { type: "function_call", name: "ls", arguments: "{}", call_id: "x" },
  ]);
});

test("skips malformed lines instead of failing the whole session", () => {
  assert.equal(toRollout([session[0], "{not json", session[2]])!.lines.length, 2);
});

test("returns null when there is no session header", () => {
  assert.equal(toRollout(session.slice(1)), null);
});

test("names the file the way Codex partitions rollouts", () => {
  assert.equal(
    rolloutRelativePath(toRollout(session)!),
    "sessions/2026/09/14/rollout-2026-09-14T13-00-31-01a0a001-3de5-76db-9cb6-009607f0d824.jsonl",
  );
});
