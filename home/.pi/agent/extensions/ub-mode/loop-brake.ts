const fingerprint = (command: string) => command.trim().replace(/\s+/g, " ");

export function createLoopBrake(maxConsecutiveFailures = 2) {
  const failures = new Map<string, number>();
  const failuresOf = (key: string) => failures.get(key) ?? 0;
  return {
    check(command: string): string | null {
      const count = failuresOf(fingerprint(command));
      if (count < maxConsecutiveFailures) return null;
      return [
        `ub-mode loop brake: this exact command failed ${count} times in a row with no file change in between.`,
        "Running it again will fail the same way. Change approach: read the error, reproduce it smaller,",
        "or dispatch `scout` to trace the root cause. Editing any file resets the brake.",
      ].join("\n");
    },
    recordRun(command: string, failed: boolean) {
      const key = fingerprint(command);
      if (failed) failures.set(key, failuresOf(key) + 1);
      else failures.delete(key);
    },
    recordChange() {
      failures.clear();
    },
  };
}
