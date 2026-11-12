export interface BudgetLimits {
  maxTokens?: number;
  maxMinutes?: number;
}

export interface UsageDelta {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead?: number;
}

interface PiJsonEvent {
  type: string;
  message?: any;
  [key: string]: any;
}

const DEFAULT_MAX_TOKENS = 1_000_000;
const DEFAULT_MAX_MINUTES = 30;
const MAX_CONSECUTIVE_FAILURES = 5;
const MAX_IDENTICAL_CALLS = 5;

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

export function createBudget(limits: BudgetLimits) {
  const maxTokens = limits.maxTokens ?? DEFAULT_MAX_TOKENS;
  const maxMinutes = limits.maxMinutes ?? DEFAULT_MAX_MINUTES;

  let totalTokens = 0;
  let consecutiveFailures = 0;
  const callCounts = new Map<string, number>();

  return {
    recordUsage(usage: UsageDelta): string | null {
      const delta = usage.input + usage.output + usage.cacheWrite;
      totalTokens += delta;

      if (totalTokens >= maxTokens) {
        return `token limit exceeded: ${totalTokens} tokens used, limit ${maxTokens}`;
      }

      return null;
    },

    checkTime(startMs: number, nowMs: number): string | null {
      const elapsedMinutes = (nowMs - startMs) / (60 * 1000);
      if (elapsedMinutes > maxMinutes) {
        return `time limit exceeded: ${Math.round(elapsedMinutes)} minutes elapsed, limit ${maxMinutes}`;
      }
      return null;
    },

    recordToolCall(name: string, args: unknown): string | null {
      const key = `${name}:${canonicalJson(args)}`;
      const count = (callCounts.get(key) ?? 0) + 1;
      callCounts.set(key, count);
      return count >= MAX_IDENTICAL_CALLS ? `same tool call repeated ${count} times: ${name}` : null;
    },

    recordToolResult(success: boolean): string | null {
      if (success) {
        consecutiveFailures = 0;
        return null;
      }

      consecutiveFailures++;
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        return `${MAX_CONSECUTIVE_FAILURES} consecutive tool failures`;
      }
      return null;
    },
  };
}

function handleBreach(
  breachMessage: string,
  setState: (reason: string) => void,
  stopMonitor: () => void,
  onBreach: () => void
) {
  setState(breachMessage);
  stopMonitor();
  onBreach();
}

function processMessageEnd(
  event: PiJsonEvent,
  budget: ReturnType<typeof createBudget>,
  setState: (reason: string) => void,
  stopMonitor: () => void,
  onBreach: () => void
) {
  if (event.type !== "message_end" || event.message?.role !== "assistant") {
    return;
  }
  const breach = recordAssistantUsage(event.message.usage, budget) ?? recordAssistantToolCalls(event.message.content, budget);
  if (breach) {
    handleBreach(breach, setState, stopMonitor, onBreach);
  }
}

function recordAssistantUsage(usage: any, budget: ReturnType<typeof createBudget>): string | null {
  if (!usage) return null;
  return budget.recordUsage({
    input: usage.input || 0,
    output: usage.output || 0,
    cacheWrite: usage.cacheWrite || 0,
    cacheRead: usage.cacheRead,
  });
}

function recordAssistantToolCalls(content: unknown, budget: ReturnType<typeof createBudget>): string | null {
  if (!Array.isArray(content)) return null;
  for (const part of content) {
    if (part?.type !== "toolCall") continue;
    const breach = budget.recordToolCall(part.name, part.arguments);
    if (breach) return breach;
  }
  return null;
}

function processToolResult(
  event: PiJsonEvent,
  budget: ReturnType<typeof createBudget>,
  setState: (reason: string) => void,
  stopMonitor: () => void,
  onBreach: () => void
) {
  if (event.type !== "tool_result_end" || !event.message) {
    return;
  }
  const breach = budget.recordToolResult(event.message.isError !== true);
  if (breach) {
    handleBreach(breach, setState, stopMonitor, onBreach);
  }
}

export function createBudgetMonitor(
  limits: BudgetLimits,
  onBreach: () => void,
  checkIntervalMs = 5000
) {
  const budget = createBudget(limits);
  const startTime = Date.now();
  let interval: NodeJS.Timeout | null = null;
  let reason = "";

  const setState = (r: string) => { reason = r; };

  const stop = () => {
    if (interval) {
      clearInterval(interval);
      interval = null;
    }
  };

  const checkTimeLimit = () => {
    const breach = budget.checkTime(startTime, Date.now());
    if (breach) {
      handleBreach(breach, setState, stop, onBreach);
    }
  };

  interval = setInterval(checkTimeLimit, checkIntervalMs);
  interval.unref();

  return {
    observe(event: PiJsonEvent) {
      processMessageEnd(event, budget, setState, stop, onBreach);
      processToolResult(event, budget, setState, stop, onBreach);
    },

    stop,

    get breachReason() {
      return reason;
    },
  };
}
