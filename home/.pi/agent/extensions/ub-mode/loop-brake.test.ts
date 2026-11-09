import { test } from "node:test";
import assert from "node:assert/strict";
import { createLoopBrake } from "./loop-brake.ts";

test("allows a command the first two times it fails", () => {
  const brake = createLoopBrake();
  assert.equal(brake.check("npm test"), null);
  brake.recordRun("npm test", true);
  assert.equal(brake.check("npm test"), null);
});

test("blocks the third identical run after two consecutive failures", () => {
  const brake = createLoopBrake();
  brake.recordRun("npm test", true);
  brake.recordRun("npm test", true);
  assert.match(brake.check("npm test") ?? "", /failed 2 times in a row/);
});

test("with a limit of 1, a never-run command is allowed but one failure blocks the retry", () => {
  const brake = createLoopBrake(1);
  assert.equal(brake.check("npm test"), null);
  brake.recordRun("npm test", true);
  assert.match(brake.check("npm test") ?? "", /failed 1 times in a row/);
});

test("treats whitespace-only differences as the same command", () => {
  const brake = createLoopBrake();
  brake.recordRun("npm  test", true);
  brake.recordRun("npm test\n", true);
  assert.notEqual(brake.check(" npm test"), null);
});

test("a success resets that command's streak", () => {
  const brake = createLoopBrake();
  brake.recordRun("npm test", true);
  brake.recordRun("npm test", false);
  brake.recordRun("npm test", true);
  assert.equal(brake.check("npm test"), null);
});

test("a file change in between resets every streak", () => {
  const brake = createLoopBrake();
  brake.recordRun("npm test", true);
  brake.recordRun("npm test", true);
  brake.recordChange();
  assert.equal(brake.check("npm test"), null);
});

test("streaks are tracked per command", () => {
  const brake = createLoopBrake();
  brake.recordRun("npm test", true);
  brake.recordRun("npm run lint", true);
  brake.recordRun("npm test", true);
  assert.notEqual(brake.check("npm test"), null);
  assert.equal(brake.check("npm run lint"), null);
});
