import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
	type ExtensionAPI,
	getAgentDir,
	parseFrontmatter,
	withFileMutationQueue,
} from "@earendil-works/pi-coding-agent";

const CHILD_GUARD_ENV = "PI_NO_AUTO_CLEANUP";
const DISABLE_ENV = "PI_DISABLE_AUTO_CLEANUP";
const CLEANUP_AGENT = "cleanup";
const MUTATING_TOOLS = new Set(["write", "edit"]);
const LEFT_FOR_YOU = /##\s*Left for you/i;

interface CleanupAgentDef {
	model?: string;
	tools?: string[];
	systemPrompt: string;
}

interface CleanupResult {
	output: string;
	ok: boolean;
}

interface JsonEvent {
	type?: string;
	message?: { role?: string; content?: Array<{ type: string; text?: string }> };
}

function parseTools(raw: unknown): string[] | undefined {
	let tools: string[] = [];
	if (Array.isArray(raw)) tools = raw.filter((t): t is string => typeof t === "string");
	else if (typeof raw === "string") tools = raw.split(",").map((t) => t.trim()).filter(Boolean);
	return tools.length > 0 ? tools : undefined;
}

function loadCleanupAgent(): CleanupAgentDef | null {
	const filePath = path.join(getAgentDir(), "agents", `${CLEANUP_AGENT}.md`);
	if (!fs.existsSync(filePath)) return null;
	try {
		const content = fs.readFileSync(filePath, "utf-8");
		const { frontmatter, body } = parseFrontmatter<{ model?: unknown; tools?: unknown }>(content);
		return {
			model: typeof frontmatter.model === "string" ? frontmatter.model : undefined,
			tools: parseTools(frontmatter.tools),
			systemPrompt: body,
		};
	} catch {
		return null;
	}
}

function getPiInvocation(args: string[]): { command: string; args: string[] } {
	const currentScript = process.argv[1];
	const isBunVirtualScript = currentScript?.startsWith("/$bunfs/root/");
	if (currentScript && !isBunVirtualScript && fs.existsSync(currentScript)) {
		return { command: process.execPath, args: [currentScript, ...args] };
	}
	const execName = path.basename(process.execPath).toLowerCase();
	const isGenericRuntime = /^(node|bun)(\.exe)?$/.test(execName);
	if (!isGenericRuntime) return { command: process.execPath, args };
	return { command: "pi", args };
}

function buildCleanupArgs(agent: CleanupAgentDef, promptPath: string, files: string[]): string[] {
	const args = ["--mode", "json", "-p", "--no-session", "--append-system-prompt", promptPath];
	if (agent.model) args.push("--model", agent.model);
	if (agent.tools?.length) args.push("--tools", agent.tools.join(","));
	const fileList = files.map((f) => `- ${f}`).join("\n");
	args.push(`Task: These files were modified this turn. Clean up basic warnings in them only.\n\n${fileList}`);
	return args;
}

function lastAssistantText(line: string): string | null {
	if (!line.trim()) return null;
	let event: JsonEvent;
	try {
		event = JSON.parse(line);
	} catch {
		return null;
	}
	if (event.type !== "message_end" || event.message?.role !== "assistant") return null;
	const texts = (event.message.content ?? []).filter((part) => part.type === "text" && part.text);
	return texts.at(-1)?.text ?? null;
}

function killOnAbort(proc: ReturnType<typeof spawn>, signal: AbortSignal) {
	const kill = () => {
		proc.kill("SIGTERM");
		setTimeout(() => {
			if (!proc.killed) proc.kill("SIGKILL");
		}, 3000);
	};
	if (signal.aborted) kill();
	else signal.addEventListener("abort", kill, { once: true });
}

function spawnPi(args: string[], cwd: string, signal: AbortSignal): Promise<CleanupResult> {
	return new Promise((resolve) => {
		const invocation = getPiInvocation(args);
		const proc = spawn(invocation.command, invocation.args, {
			cwd,
			shell: false,
			stdio: ["ignore", "pipe", "pipe"],
			env: { ...process.env, [CHILD_GUARD_ENV]: "1" },
		});
		let buffer = "";
		let finalText = "";
		let stderr = "";
		const processLine = (line: string) => {
			finalText = lastAssistantText(line) ?? finalText;
		};

		proc.stdout.on("data", (data) => {
			buffer += data.toString();
			const lines = buffer.split("\n");
			buffer = lines.pop() || "";
			lines.forEach(processLine);
		});
		proc.stderr.on("data", (data) => {
			stderr += data.toString();
		});
		proc.on("close", (code) => {
			processLine(buffer);
			resolve({ output: finalText || stderr || "(no output)", ok: code === 0 });
		});
		proc.on("error", (err) => resolve({ output: String(err), ok: false }));
		killOnAbort(proc, signal);
	});
}

async function runCleanup(
	agent: CleanupAgentDef,
	cwd: string,
	files: string[],
	signal: AbortSignal,
): Promise<CleanupResult> {
	const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "pi-cleanup-"));
	const promptPath = path.join(tmpDir, "cleanup-prompt.md");
	try {
		await withFileMutationQueue(promptPath, async () => {
			await fs.promises.writeFile(promptPath, agent.systemPrompt, { encoding: "utf-8", mode: 0o600 });
		});
		return await spawnPi(buildCleanupArgs(agent, promptPath, files), cwd, signal);
	} finally {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	}
}

function countNeedsReview(report: string): number {
	const section = report.split(LEFT_FOR_YOU)[1];
	return section?.match(/^-\s/gm)?.length ?? 0;
}

function summarize(report: string): string {
	const fixed = (report.match(/^-\s+`[^`]+`/gm) ?? []).length;
	const needsReview = countNeedsReview(report);
	const parts: string[] = [];
	if (fixed > 0) parts.push(`${fixed} fix${fixed > 1 ? "es" : ""} applied`);
	if (needsReview > 0) parts.push(`${needsReview} need${needsReview > 1 ? "" : "s"} review`);
	return parts.length > 0 ? `Cleanup: ${parts.join(", ")}.` : "Cleanup done.";
}

type Notify = (message: string, level: "info" | "warning") => void;

function reportResult({ output, ok }: CleanupResult, notify: Notify) {
	const trimmed = output.trim();
	if (/^nothing to clean up\.?$/i.test(trimmed)) notify("Cleanup: nothing to fix.", "info");
	else notify(`${summarize(trimmed)}\n\n${trimmed}`, ok ? "info" : "warning");
}

function isDisabled(): boolean {
	return process.env[CHILD_GUARD_ENV] === "1" || process.env[DISABLE_ENV] === "1";
}

interface CleanupState {
	pendingPaths: Map<string, string>;
	changedFiles: Set<string>;
	activeRun: AbortController | null;
}

function trackStart(state: CleanupState, event: { toolName: string; toolCallId: string; args: unknown }) {
	if (!MUTATING_TOOLS.has(event.toolName)) return;
	const p = (event.args as { path?: string })?.path;
	if (typeof p === "string" && p) state.pendingPaths.set(event.toolCallId, p);
}

function trackEnd(state: CleanupState, event: { toolCallId: string; isError: boolean }) {
	const p = state.pendingPaths.get(event.toolCallId);
	if (!p) return;
	state.pendingPaths.delete(event.toolCallId);
	if (!event.isError) state.changedFiles.add(p);
}

async function cleanupInBackground(
	state: CleanupState,
	agent: CleanupAgentDef,
	cwd: string,
	files: string[],
	notify: Notify,
) {
	const controller = new AbortController();
	state.activeRun = controller;
	try {
		const result = await runCleanup(agent, cwd, files, controller.signal);
		if (!controller.signal.aborted) reportResult(result, notify);
	} catch (err) {
		if (!controller.signal.aborted) notify(`Cleanup failed: ${String(err)}`, "warning");
	} finally {
		if (state.activeRun === controller) state.activeRun = null;
	}
}

function startCleanup(state: CleanupState, ctx: { hasUI: boolean; cwd: string; ui: { notify: Notify } }) {
	if (isDisabled() || !ctx.hasUI || state.activeRun || state.changedFiles.size === 0) return;
	const files = Array.from(state.changedFiles);
	state.changedFiles.clear();
	const agent = loadCleanupAgent();
	if (!agent) return;
	const n = files.length;
	ctx.ui.notify(`Cleanup: scanning ${n} changed file${n > 1 ? "s" : ""}...`, "info");
	void cleanupInBackground(state, agent, ctx.cwd, files, (message, level) => ctx.ui.notify(message, level));
}

function stopCleanup(state: CleanupState) {
	state.activeRun?.abort();
	state.activeRun = null;
}

export default function autoCleanupExtension(pi: ExtensionAPI) {
	const state: CleanupState = { pendingPaths: new Map(), changedFiles: new Set(), activeRun: null };
	pi.on("session_shutdown", async () => stopCleanup(state));
	pi.on("tool_execution_start", async (event) => trackStart(state, event));
	pi.on("tool_execution_end", async (event) => trackEnd(state, event));
	pi.on("agent_settled", async (_event, ctx) => startCleanup(state, ctx));
}
