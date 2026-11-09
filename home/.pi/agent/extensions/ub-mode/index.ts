import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createLoopBrake } from "./loop-brake.ts";

const HOME = os.homedir();
const BIN = {
  crapper: path.join(HOME, ".local", "bin", "crapper"),
  dryer: path.join(HOME, ".local", "bin", "dryer"),
};
const SCRATCH = path.join(HOME, ".ub-tools", ".scratch");

const SRC_EXT = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".py",
  ".go",
  ".java",
  ".rs",
  ".clj",
  ".cljs",
  ".cljc",
]);

const CRAP_MAX = 10;
const DUP_MIN = 0.8;
const PER_EDIT_TIMEOUT_MS = 30_000;
const COMMIT_TIMEOUT_MS = 120_000;

const TEST_DIR_RE = new RegExp("(^|/)(tests?|specs?|__tests__)/");

const DECISION_TREE = [
  "== ub-mode auto-gate (ACTIVE) ==",
  "Quality gates run automatically on edits and are HARD-ENFORCED at git commit.",
  "Use this routing; prefer dispatching the named pi subagent.",
  "",
  "TASK START",
  "- Unfamiliar area, or more than one unknown file -> dispatch `scout` for recon, then `planner` for a plan.",
  "- Clear, local change -> proceed inline with the smallest edit (Laziness Protocol).",
  "",
  "AFTER EDITS (gate notes are appended to your edit results when a function fails)",
  "- crapper flags a function (CRAP >= 10, or CC > 10 when coverage is absent) -> dispatch `worker` to split or test it, then `reviewer` to confirm.",
  "- dryer flags duplication (>= 0.8) -> dispatch `worker` to dedupe so one decision lives in one place.",
  "- Only lint, format, unused-import, or stray-debug noise -> dispatch `cleanup`.",
  "- Behavior unclear or a bug -> reproduce first, dispatch `scout` to trace, then fix the root cause (never a crash-hiding guard).",
  "",
  "BEFORE COMMIT (enforced; the commit is BLOCKED on failure)",
  "- Gates run on changed source files. Resolve every flagged function and duplicate, then commit.",
  "- If a test suite exists -> run `mutator --changed`: cover the uncovered, kill survivors; `cleanup` deletes dead code.",
  "- Commit often in small ordered commits; the message says why and how you proved it.",
  "- Bypass once (rare): include [skip-ub] in the commit message.",
].join("\n");

export default function (pi: ExtensionAPI) {
  let enabled = true;
  let warned = false;

  const ensureReady = (notify?: (m: string) => void): boolean => {
    if (!enabled) return false;
    if (!fs.existsSync(BIN.crapper) || !fs.existsSync(BIN.dryer)) {
      if (!warned) {
        warned = true;
        notify?.(
          "ub-mode: crapper/dryer not found in ~/.local/bin; gating disabled",
        );
      }
      enabled = false;
      return false;
    }
    try {
      fs.mkdirSync(SCRATCH, { recursive: true });
    } catch {
      return false;
    }
    return true;
  };

  const isSource = (p: string): boolean => {
    if (!p) return false;
    const base = path.basename(p);
    const testish =
      TEST_DIR_RE.test(p) ||
      /(\.test\.|\.spec\.|_test\.)/.test(base) ||
      /^test_.*\.py$/.test(base) ||
      /_test\.go$/.test(base);
    return SRC_EXT.has(path.extname(p)) && !testish;
  };

  const run = (bin: string, args: string[], timeout: number) => {
    const r = spawnSync(bin, args, { cwd: SCRATCH, encoding: "utf8", timeout });
    return { code: r.status ?? -1, out: r.stdout ?? "", err: r.stderr ?? "" };
  };

  type CrapRow = { fn: string; cc: number; crap: number | null };

  const parseCrap = (out: string): CrapRow[] => {
    const rows: CrapRow[] = [];
    let inTable = false;
    for (const line of out.split("\n")) {
      if (/^-{5,}/.test(line)) {
        inTable = true;
        continue;
      }
      if (!inTable) continue;
      const t = line.trim();
      if (!t || t.startsWith("Wrote ")) continue;
      const parts = t.split(/\s+/);
      if (parts.length < 5) continue;
      const crapRaw = parts[parts.length - 1];
      const ccRaw = parts[parts.length - 3];
      const fn = parts.slice(0, parts.length - 4).join(" ") || parts[0];
      const cc = Number(ccRaw);
      if (Number.isNaN(cc)) continue;
      const crap = crapRaw === "N/A" ? null : Number(crapRaw);
      rows.push({ fn, cc, crap });
    }
    return rows;
  };

  const crapViolations = (rows: CrapRow[]) =>
    rows.filter((r) => (r.crap != null ? r.crap >= CRAP_MAX : r.cc > CRAP_MAX));

  const describeCrap = (r: CrapRow): string =>
    r.crap != null ? `CRAP ${r.crap}` : `CC ${r.cc}`;

  type Dupe = { score: number; left: string; right: string };

  const parseDupes = (out: string): Dupe[] => {
    const lines = out.split("\n");
    const dupes: Dupe[] = [];
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/DUPLICATE score=([\d.]+)/);
      if (!m) continue;
      dupes.push({
        score: Number(m[1]),
        left: (lines[i + 1] ?? "").trim(),
        right: (lines[i + 2] ?? "").trim(),
      });
    }
    return dupes;
  };

  const gitLines = (cwd: string, args: string[]): string[] => {
    const r = spawnSync("git", args, {
      cwd,
      encoding: "utf8",
      timeout: 15_000,
    });
    if ((r.status ?? 1) !== 0) return [];
    return (r.stdout ?? "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
  };

  const changedSourceFiles = (cwd: string): string[] => {
    const inside = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], {
      cwd,
      encoding: "utf8",
      timeout: 10_000,
    });
    if ((inside.stdout ?? "").trim() !== "true") return [];
    const set = new Set<string>([
      ...gitLines(cwd, ["diff", "--name-only"]),
      ...gitLines(cwd, ["diff", "--cached", "--name-only"]),
      ...gitLines(cwd, ["ls-files", "--others", "--exclude-standard"]),
    ]);
    return [...set]
      .map((rel) => path.resolve(cwd, rel))
      .filter((abs) => isSource(abs) && fs.existsSync(abs));
  };

  const brake = createLoopBrake();
  const bashCommand = (input: unknown) => (input as { command?: string } | undefined)?.command ?? "";

  pi.on("tool_result", async (event) => {
    if (event.toolName === "bash") brake.recordRun(bashCommand(event.input), event.isError === true);
    if (event.toolName === "edit" || event.toolName === "write") brake.recordChange();
  });

  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "bash") return;
    const reason = brake.check(bashCommand(event.input));
    if (!reason) return;
    ctx.ui.notify("ub-mode: loop brake blocked a repeated failing command", "warn");
    return { block: true, reason };
  });

  pi.on("before_agent_start", async (event) => {
    return { systemPrompt: event.systemPrompt + "\n\n" + DECISION_TREE };
  });

  pi.on("tool_result", async (event, ctx) => {
    if (event.toolName !== "edit" && event.toolName !== "write") return;
    if (!ensureReady((m) => ctx.ui.notify(m, "warn"))) return;
    const input = event.input as { path?: string } | undefined;
    const rel = input?.path;
    if (!rel) return;
    const abs = path.resolve(process.cwd(), rel);
    if (!isSource(abs) || !fs.existsSync(abs)) return;

    try {
      const res = run(BIN.crapper, ["--no-coverage", abs], PER_EDIT_TIMEOUT_MS);
      const bad = crapViolations(parseCrap(res.out));
      if (bad.length === 0) return;
      const lines = bad
        .map(
          (r) =>
            `  - ${r.fn}: ${describeCrap(r)} (gate ${CRAP_MAX}) -> dispatch \`worker\` to split/test; then \`reviewer\`.`,
        )
        .join("\n");
      const note = {
        type: "text" as const,
        text: `\n\n[ub-mode] ${path.basename(abs)} failed the complexity gate:\n${lines}`,
      };
      const content = Array.isArray(event.content)
        ? [...event.content, note]
        : [note];
      ctx.ui.notify(
        `ub-mode: ${bad.length} complex function(s) in ${path.basename(abs)}`,
        "warn",
      );
      return { content };
    } catch {
      return;
    }
  });

  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "bash") return;
    const cmd =
      (event.input as { command?: string } | undefined)?.command ?? "";
    if (!/\bgit\s+commit\b/.test(cmd)) return;
    if (cmd.includes("[skip-ub]")) return;
    if (!ensureReady((m) => ctx.ui.notify(m, "warn"))) return;

    const cwd = process.cwd();
    let files: string[];
    try {
      files = changedSourceFiles(cwd);
    } catch {
      return;
    }
    if (files.length === 0) return;

    try {
      const crap = run(
        BIN.crapper,
        ["--no-coverage", ...files],
        COMMIT_TIMEOUT_MS,
      );
      const complex = crapViolations(parseCrap(crap.out));
      const dry = run(
        BIN.dryer,
        ["--threshold", String(DUP_MIN), ...files],
        COMMIT_TIMEOUT_MS,
      );
      const dupes = parseDupes(dry.out).filter((d) => d.score >= DUP_MIN);

      if (complex.length === 0 && dupes.length === 0) return;

      const parts: string[] = [
        "ub-mode commit gate BLOCKED. Fix before committing.",
      ];
      if (complex.length) {
        parts.push("", "Complexity (gate 10):");
        for (const r of complex) {
          parts.push(
            `  - ${r.fn}: ${describeCrap(r)} -> dispatch \`worker\` to split or test; \`reviewer\` to confirm.`,
          );
        }
      }
      if (dupes.length) {
        parts.push("", "Duplication (>= 0.8):");
        for (const d of dupes) {
          parts.push(
            `  - ${d.left} <-> ${d.right}  score ${d.score.toFixed(2)} -> dispatch \`worker\` to dedupe.`,
          );
        }
      }
      parts.push(
        "",
        "Resolve these, then re-commit. Bypass once by adding [skip-ub] to the commit message.",
      );
      ctx.ui.notify("ub-mode: commit blocked by quality gate", "error");
      return { block: true, reason: parts.join("\n") };
    } catch {
      return;
    }
  });
}
