import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import * as os from "node:os";
import * as path from "node:path";
import {
  formatFindings,
  resolveSkillDirs,
  scanSkillDir,
  skillDirFromReadPath,
  skillNameFromInput,
  type Findings,
  type ScanResult,
} from "./scan.ts";

const HOME = os.homedir();

function skillBases(cwd: string): string[] {
  return [
    path.join(HOME, ".claude", "skills"),
    path.join(HOME, ".agents", "skills"),
    path.join(HOME, ".pi", "agent", "skills"),
    path.join(cwd, ".pi", "skills"),
    path.join(cwd, ".agents", "skills"),
    path.join(cwd, ".claude", "skills"),
  ];
}

function mergeScans(dirs: string[]): ScanResult {
  const results = dirs.map(scanSkillDir);
  return { hits: results.flatMap((r) => r.hits), notes: results.flatMap((r) => r.notes) };
}

export default function (pi: ExtensionAPI) {
  const cache = new Map<string, Findings | undefined>();
  let pendingNote: string | undefined;

  function check(key: string, name: string, dirs: string[], ctx: ExtensionContext): Findings | undefined {
    if (cache.has(key)) return cache.get(key);
    const findings = formatFindings(name, mergeScans(dirs));
    cache.set(key, findings);
    if (findings) ctx.ui.notify(findings.warning, "warning");
    return findings;
  }

  pi.on("session_start", () => {
    cache.clear();
    pendingNote = undefined;
  });

  pi.on("input", (event, ctx) => {
    try {
      const name = skillNameFromInput(event.text);
      if (!name) return { action: "continue" };
      const dirs = resolveSkillDirs(name, skillBases(ctx.cwd));
      pendingNote = check(dirs.join("\n") || name, name, dirs, ctx)?.modelNote;
    } catch {
      pendingNote = undefined;
    }
    return { action: "continue" };
  });

  pi.on("before_agent_start", (event) => {
    if (!pendingNote) return {};
    const note = pendingNote;
    pendingNote = undefined;
    return { systemPrompt: `${event.systemPrompt}\n\n${note}` };
  });

  pi.on("tool_result", (event, ctx) => {
    try {
      if (event.toolName !== "read") return undefined;
      const dir = skillDirFromReadPath((event.input as { path?: unknown })?.path, ctx.cwd);
      if (!dir) return undefined;
      const note = check(dir, path.basename(dir), [dir], ctx)?.modelNote;
      if (!note) return undefined;
      return { content: [...event.content, { type: "text" as const, text: `\n\n[skill-guard] ${note}` }] };
    } catch {
      return undefined;
    }
  });
}
