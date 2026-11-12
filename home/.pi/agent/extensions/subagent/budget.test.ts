import { test } from "node:test";
import assert from "node:assert/strict";
import { createBudget, createBudgetMonitor } from "./budget.ts";

const failedResult = () =>
  ({ role: "toolResult", toolCallId: "c", toolName: "bash", isError: true, content: [{ type: "text", text: "exit 1" }] }) as unknown as Message;
const okResult = () =>
  ({ role: "toolResult", toolCallId: "c", toolName: "bash", isError: false, content: [{ type: "text", text: "ok" }] }) as unknown as Message;
const assistantCalling = (name: string, args: Record<string, unknown>) =>
  ({ role: "assistant", content: [{ type: "toolCall", id: "c", name, arguments: args }] }) as unknown as Message;
import type { Message } from "@earendil-works/pi-ai";

test("allows execution under token limit", () => {
  const budget = createBudget({ maxTokens: 100_000, maxMinutes: 30 });
  assert.equal(budget.recordUsage({ input: 1000, output: 500, cacheWrite: 200 }), null);
  assert.equal(budget.recordUsage({ input: 2000, output: 1000, cacheWrite: 300 }), null);
});

test("blocks when token budget is exceeded", () => {
  const budget = createBudget({ maxTokens: 10_000, maxMinutes: 30 });
  budget.recordUsage({ input: 5000, output: 3000, cacheWrite: 1000 });
  const breach = budget.recordUsage({ input: 2000, output: 500, cacheWrite: 0 });
  assert.match(breach ?? "", /token limit exceeded/);
});

test("counts input + output + cacheWrite but excludes cacheRead", () => {
  const budget = createBudget({ maxTokens: 10_000, maxMinutes: 30 });
  budget.recordUsage({ input: 3000, output: 2000, cacheWrite: 1000, cacheRead: 50000 });
  assert.equal(budget.recordUsage({ input: 2000, output: 1999, cacheWrite: 0 }), null);
  const breach = budget.recordUsage({ input: 0, output: 1, cacheWrite: 0, cacheRead: 100000 });
  assert.match(breach ?? "", /token limit exceeded/);
});

test("allows execution under time limit", () => {
  const budget = createBudget({ maxTokens: 1_000_000, maxMinutes: 5 });
  assert.equal(budget.checkTime(Date.now(), Date.now() + 1 * 60 * 1000), null);
  assert.equal(budget.checkTime(Date.now(), Date.now() + 4.5 * 60 * 1000), null);
});

test("blocks when time budget is exceeded", () => {
  const budget = createBudget({ maxTokens: 1_000_000, maxMinutes: 5 });
  const start = Date.now();
  const end = start + 5.1 * 60 * 1000;
  const breach = budget.checkTime(start, end);
  assert.match(breach ?? "", /time limit exceeded/);
});

test("allows up to 4 consecutive tool failures", () => {
  const budget = createBudget({ maxTokens: 1_000_000, maxMinutes: 30 });
  assert.equal(budget.recordToolResult(false), null);
  assert.equal(budget.recordToolResult(false), null);
  assert.equal(budget.recordToolResult(false), null);
  assert.equal(budget.recordToolResult(false), null);
});

test("blocks on 5th consecutive tool failure", () => {
  const budget = createBudget({ maxTokens: 1_000_000, maxMinutes: 30 });
  budget.recordToolResult(false);
  budget.recordToolResult(false);
  budget.recordToolResult(false);
  budget.recordToolResult(false);
  const breach = budget.recordToolResult(false);
  assert.match(breach ?? "", /5 consecutive tool failures/);
});

test("tool success resets consecutive failure count", () => {
  const budget = createBudget({ maxTokens: 1_000_000, maxMinutes: 30 });
  budget.recordToolResult(false);
  budget.recordToolResult(false);
  budget.recordToolResult(false);
  budget.recordToolResult(true);
  budget.recordToolResult(false);
  budget.recordToolResult(false);
  assert.equal(budget.recordToolResult(false), null);
});

test("defaults to 1M tokens and 30 minutes", () => {
  const budget = createBudget({});
  assert.equal(budget.recordUsage({ input: 500_000, output: 400_000, cacheWrite: 99_999 }), null);
  const breach = budget.recordUsage({ input: 1, output: 0, cacheWrite: 0 });
  assert.match(breach ?? "", /token limit exceeded/);
});

test("token breach message includes total and limit", () => {
  const budget = createBudget({ maxTokens: 5000, maxMinutes: 30 });
  budget.recordUsage({ input: 2000, output: 2000, cacheWrite: 500 });
  const breach = budget.recordUsage({ input: 600, output: 0, cacheWrite: 0 });
  assert.match(breach ?? "", /5100.*5000/);
});

test("time breach message includes elapsed and limit", () => {
  const budget = createBudget({ maxTokens: 1_000_000, maxMinutes: 10 });
  const start = Date.now();
  const end = start + 11 * 60 * 1000;
  const breach = budget.checkTime(start, end);
  assert.match(breach ?? "", /11.*10/);
});

test("monitor observes message_end events and tracks token usage", () => {
  let breached = false;
  const monitor = createBudgetMonitor(
    { maxTokens: 10_000, maxMinutes: 30 },
    () => { breached = true; }
  );
  
  monitor.observe({
    type: "message_end",
    message: {
      role: "assistant",
      usage: { input: 5000, output: 3000, cacheWrite: 1000 }
    } as Message
  });
  assert.equal(breached, false);
  
  monitor.observe({
    type: "message_end",
    message: {
      role: "assistant",
      usage: { input: 2000, output: 500, cacheWrite: 0 }
    } as Message
  });
  assert.equal(breached, true);
  assert.match(monitor.breachReason, /token limit exceeded/);
  monitor.stop();
});

test("monitor observes tool_result_end events and tracks failures", () => {
  let breached = false;
  const monitor = createBudgetMonitor(
    { maxTokens: 1_000_000, maxMinutes: 30 },
    () => { breached = true; }
  );
  
  for (let i = 0; i < 4; i++) {
    monitor.observe({
      type: "tool_result_end",
      message: failedResult()
    });
  }
  assert.equal(breached, false);
  
  monitor.observe({
    type: "tool_result_end",
    message: failedResult()
  });
  assert.equal(breached, true);
  assert.match(monitor.breachReason, /5 consecutive tool failures/);
  monitor.stop();
});

test("monitor tool success resets consecutive failure count", () => {
  let breached = false;
  const monitor = createBudgetMonitor(
    { maxTokens: 1_000_000, maxMinutes: 30 },
    () => { breached = true; }
  );
  
  for (let i = 0; i < 3; i++) {
    monitor.observe({
      type: "tool_result_end",
      message: failedResult()
    });
  }
  
  monitor.observe({
    type: "tool_result_end",
    message: okResult()
  });
  
  for (let i = 0; i < 4; i++) {
    monitor.observe({
      type: "tool_result_end",
      message: failedResult()
    });
  }
  
  assert.equal(breached, false);
  monitor.stop();
});

test("monitor triggers time breach via interval", (_t, done) => {
  let breached = false;
  const monitor = createBudgetMonitor(
    { maxTokens: 1_000_000, maxMinutes: 0.001 },
    () => { 
      breached = true;
      monitor.stop();
      assert.equal(breached, true);
      assert.match(monitor.breachReason, /time limit exceeded/);
      done();
    },
    100
  );
});

test("monitor stop clears interval and prevents further breaches", (_t, done) => {
  let breachCount = 0;
  const monitor = createBudgetMonitor(
    { maxTokens: 1_000_000, maxMinutes: 0.001 },
    () => { breachCount++; },
    100
  );
  
  setTimeout(() => {
    monitor.stop();
    const countAtStop = breachCount;
    setTimeout(() => {
      assert.equal(breachCount, countAtStop);
      done();
    }, 200);
  }, 50);
});

test("monitor ignores unrecognized events", () => {
  let breached = false;
  const monitor = createBudgetMonitor(
    { maxTokens: 1_000_000, maxMinutes: 30 },
    () => { breached = true; }
  );
  
  monitor.observe({ type: "unknown", data: {} });
  monitor.observe({ type: "thinking_start" });
  assert.equal(breached, false);
  monitor.stop();
});

test("monitor handles message_end without usage", () => {
  let breached = false;
  const monitor = createBudgetMonitor(
    { maxTokens: 1_000_000, maxMinutes: 30 },
    () => { breached = true; }
  );
  
  monitor.observe({
    type: "message_end",
    message: { role: "assistant" } as Message
  });
  assert.equal(breached, false);
  monitor.stop();
});

test("monitor ignores message_end with non-assistant role", () => {
  let breached = false;
  const monitor = createBudgetMonitor(
    { maxTokens: 100, maxMinutes: 30 },
    () => { breached = true; }
  );
  
  monitor.observe({
    type: "message_end",
    message: {
      role: "user",
      usage: { input: 1000, output: 1000, cacheWrite: 1000 }
    } as Message
  });
  assert.equal(breached, false);
  monitor.stop();
});

test("monitor stop is idempotent", () => {
  const monitor = createBudgetMonitor(
    { maxTokens: 1_000_000, maxMinutes: 30 },
    () => {}
  );
  
  monitor.stop();
  monitor.stop();
  monitor.stop();
  assert.equal(monitor.breachReason, "");
});

test("monitor breachReason is empty before breach", () => {
  const monitor = createBudgetMonitor(
    { maxTokens: 1_000_000, maxMinutes: 30 },
    () => {}
  );
  
  assert.equal(monitor.breachReason, "");
  monitor.observe({
    type: "message_end",
    message: {
      role: "assistant",
      usage: { input: 100, output: 100, cacheWrite: 100 }
    } as Message
  });
  assert.equal(monitor.breachReason, "");
  monitor.stop();
});

test("monitor tracks cache read but excludes from limit", () => {
  let breached = false;
  const monitor = createBudgetMonitor(
    { maxTokens: 5000, maxMinutes: 30 },
    () => { breached = true; }
  );
  
  monitor.observe({
    type: "message_end",
    message: {
      role: "assistant",
      usage: { input: 2000, output: 2000, cacheWrite: 999, cacheRead: 100000 }
    } as Message
  });
  assert.equal(breached, false);
  monitor.stop();
});

test("monitor handles tool_result_end with no content", () => {
  let breached = false;
  const monitor = createBudgetMonitor(
    { maxTokens: 1_000_000, maxMinutes: 30 },
    () => { breached = true; }
  );
  
  monitor.observe({
    type: "tool_result_end",
    message: { role: "user" } as Message
  });
  assert.equal(breached, false);
  monitor.stop();
});

test("monitor handles tool_result_end with undefined content", () => {
  let breached = false;
  const monitor = createBudgetMonitor(
    { maxTokens: 1_000_000, maxMinutes: 30 },
    () => { breached = true; }
  );
  
  monitor.observe({
    type: "tool_result_end",
    message: { role: "user", content: undefined } as Message
  });
  assert.equal(breached, false);
  monitor.stop();
});

test("monitor ignores a text result that merely mentions an error", () => {
  let breached = false;
  const monitor = createBudgetMonitor({}, () => { breached = true; });
  for (let i = 0; i < 6; i++) monitor.observe({ type: "tool_result_end", message: okResult() });
  assert.equal(breached, false);
  monitor.stop();
});

test("monitor blocks the 5th identical tool call", () => {
  let breached = false;
  const monitor = createBudgetMonitor({}, () => { breached = true; });
  for (let i = 0; i < 4; i++) monitor.observe({ type: "message_end", message: assistantCalling("bash", { command: "npm test" }) });
  assert.equal(breached, false);
  monitor.observe({ type: "message_end", message: assistantCalling("bash", { command: "npm test" }) });
  assert.equal(breached, true);
  assert.match(monitor.breachReason, /same tool call repeated 5 times: bash/);
  monitor.stop();
});

test("monitor treats different arguments as different calls", () => {
  let breached = false;
  const monitor = createBudgetMonitor({}, () => { breached = true; });
  for (let i = 0; i < 8; i++) monitor.observe({ type: "message_end", message: assistantCalling("read", { path: `f${i}.ts` }) });
  assert.equal(breached, false);
  monitor.stop();
});

test("monitor treats reordered argument keys as the same call", () => {
  let breached = false;
  const monitor = createBudgetMonitor({}, () => { breached = true; });
  for (let i = 0; i < 5; i++) {
    const args = i % 2 ? { offset: 1, path: "a.ts" } : { path: "a.ts", offset: 1 };
    monitor.observe({ type: "message_end", message: assistantCalling("read", args) });
  }
  assert.equal(breached, true);
  monitor.stop();
});
