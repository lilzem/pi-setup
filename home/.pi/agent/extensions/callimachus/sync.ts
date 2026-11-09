import * as fs from "node:fs";
import * as path from "node:path";
import { rolloutRelativePath, toRollout } from "./convert.ts";

export type SyncResult = { written: number; skipped: number };

function piSessionFiles(sessionsDir: string): string[] {
  if (!fs.existsSync(sessionsDir)) return [];
  return fs
    .readdirSync(sessionsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .flatMap((d) => {
      const dir = path.join(sessionsDir, d.name);
      return fs.readdirSync(dir).filter((f) => f.endsWith(".jsonl")).map((f) => path.join(dir, f));
    });
}

const isFresh = (dest: string, src: string) =>
  fs.existsSync(dest) && fs.statSync(dest).mtimeMs >= fs.statSync(src).mtimeMs;

function syncOne(src: string, codexHome: string): boolean {
  const rollout = toRollout(fs.readFileSync(src, "utf8").split("\n").filter(Boolean));
  if (!rollout) return false;
  const dest = path.join(codexHome, rolloutRelativePath(rollout));
  if (isFresh(dest, src)) return false;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, `${rollout.lines.join("\n")}\n`);
  return true;
}

export function syncSessions(sessionsDir: string, codexHome: string): SyncResult {
  const result: SyncResult = { written: 0, skipped: 0 };
  for (const src of piSessionFiles(sessionsDir)) {
    if (syncOne(src, codexHome)) result.written++;
    else result.skipped++;
  }
  return result;
}
