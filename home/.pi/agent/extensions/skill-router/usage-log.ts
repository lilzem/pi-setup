import * as fs from "node:fs";
import * as path from "node:path";

export interface UsageEntry {
  skill: string;
  loaded: boolean;
}

export function createUsageTracker() {
  const pending = new Map<string, boolean>();

  return {
    suggest(skills: string[]) {
      for (const skill of skills) pending.set(skill, false);
    },
    observeRead(filePath: string) {
      if (path.basename(filePath) !== "SKILL.md") return;
      const skill = path.basename(path.dirname(filePath));
      if (pending.has(skill)) pending.set(skill, true);
    },
    flush(): UsageEntry[] {
      const entries = [...pending].map(([skill, loaded]) => ({ skill, loaded }));
      pending.clear();
      return entries;
    },
  };
}

export function appendUsageLog(file: string, entries: UsageEntry[], now: Date) {
  if (entries.length === 0) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const ts = now.toISOString();
  const lines = entries.map((entry) => `${JSON.stringify({ ts, ...entry })}\n`).join("");
  fs.appendFileSync(file, lines);
}
