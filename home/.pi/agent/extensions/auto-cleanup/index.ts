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

interface CleanupAgentDef {
	model?: string;
	tools?: string[];
	systemPrompt: string;
}

function loadCleanupAgent(): CleanupAgentDef | null {
	const filePath = path.join(getAgentDir(), "agents", `${CLEANUP_AGENT}.md`);
	if (!fs.existsSync(filePath)) return null;
	try {
		const content = fs.readFileSync(filePath, "utf-8");
		const { frontmatter, body } = parseFrontmatter<{ model?: unknown; tools?: unknown }>(content);
		const tools = Array.isArray(frontmatter.tools)
			? frontmatter.tools.filter((t): t is string => typeof t === "string")
			: typeof frontmatter.tools === "string"
				? frontmatter.tools.split(",").map((t) => t.trim()).filter(Boolean)
				: undefined;
		return {
			model: typeof frontmatter.model === "string" ? frontmatter.model : undefined,
			tools: tools && tools.length > 0 ? tools : undefined,
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

async function runCleanup(
	agent: CleanupAgentDef,
	cwd: string,
	files: string[],
	signal: AbortSignal,
): Promise<{ output: string; ok: boolean }> {
	const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "pi-cleanup-"));
	const promptPath = path.join(tmpDir, "cleanup-prompt.md");
	await withFileMutationQueue(promptPath, async () => {
		await fs.promises.writeFile(promptPath, agent.systemPrompt, { encoding: "utf-8", mode: 0o600 });
	});

	const args = ["--mode", "json", "-p", "--no-session", "--append-system-prompt", promptPath];
	if (agent.model) args.push("--model", agent.model);
	if (agent.tools?.length) args.push("--tools", agent.tools.join(","));

	const fileList = files.map((f) => `- ${f}`).join("\n");
	args.push(`Task: These files were modified this turn. Clean up basic warnings in them only.\n\n${fileList}`);

	try {
		return await new Promise<{ output: string; ok: boolean }>((resolve) => {
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
				if (!line.trim()) return;
				let event: { type?: string; message?: { role?: string; content?: Array<{ type: string; text?: string }> } };
				try {
					event = JSON.parse(line);
				} catch {
					return;
				}
				if (event.type === "message_end" && event.message?.role === "assistant") {
					for (const part of event.message.content ?? []) {
						if (part.type === "text" && part.text) finalText = part.text;
					}
				}
			};

			proc.stdout.on("data", (data) => {
				buffer += data.toString();
				const lines = buffer.split("\n");
				buffer = lines.pop() || "";
				for (const line of lines) processLine(line);
			});
			proc.stderr.on("data", (data) => {
				stderr += data.toString();
			});
			proc.on("close", (code) => {
				if (buffer.trim()) processLine(buffer);
				resolve({ output: finalText || stderr || "(no output)", ok: code === 0 });
			});
			proc.on("error", (err) => resolve({ output: String(err), ok: false }));

			const kill = () => {
				proc.kill("SIGTERM");
				setTimeout(() => {
					if (!proc.killed) proc.kill("SIGKILL");
				}, 3000);
			};
			if (signal.aborted) kill();
			else signal.addEventListener("abort", kill, { once: true });
		});
	} finally {
		try {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		} catch {
			void 0;
		}
	}
}

function summarize(report: string): string {
	const fixed = (report.match(/^-\s+`[^`]+`/gm) ?? []).length;
	const needsReview = /##\s*Left for you/i.test(report)
		? (report.split(/##\s*Left for you/i)[1]?.match(/^-\s/gm) ?? []).length
		: 0;
	const parts: string[] = [];
	if (fixed > 0) parts.push(`${fixed} fix${fixed > 1 ? "es" : ""} applied`);
	if (needsReview > 0) parts.push(`${needsReview} need${needsReview > 1 ? "" : "s"} review`);
	return parts.length > 0 ? `Cleanup: ${parts.join(", ")}.` : "Cleanup done.";
}

export default function autoCleanupExtension(pi: ExtensionAPI) {
	const pendingPaths = new Map<string, string>();
	const changedFiles = new Set<string>();
	let running = false;

	pi.on("tool_execution_start", async (event) => {
		if (!MUTATING_TOOLS.has(event.toolName)) return;
		const p = (event.args as { path?: string })?.path;
		if (typeof p === "string" && p) pendingPaths.set(event.toolCallId, p);
	});

	pi.on("tool_execution_end", async (event) => {
		const p = pendingPaths.get(event.toolCallId);
		if (!p) return;
		pendingPaths.delete(event.toolCallId);
		if (!event.isError) changedFiles.add(p);
	});

	pi.on("agent_settled", async (_event, ctx) => {
		if (process.env[CHILD_GUARD_ENV] === "1") return;
		if (process.env[DISABLE_ENV] === "1") return;
		if (!ctx.hasUI) return;
		if (running) return;
		if (changedFiles.size === 0) return;

		const files = Array.from(changedFiles);
		changedFiles.clear();

		const agent = loadCleanupAgent();
		if (!agent) return;

		running = true;
		ctx.ui.notify(`Cleanup: scanning ${files.length} changed file${files.length > 1 ? "s" : ""}...`, "info");
		void (async () => {
			const controller = new AbortController();
			try {
				const { output, ok } = await runCleanup(agent, ctx.cwd, files, controller.signal);
				const trimmed = output.trim();
				if (/^nothing to clean up\.?$/i.test(trimmed)) {
					ctx.ui.notify("Cleanup: nothing to fix.", "info");
				} else {
					ctx.ui.notify(`${summarize(trimmed)}\n\n${trimmed}`, ok ? "info" : "warning");
				}
			} catch (err) {
				ctx.ui.notify(`Cleanup failed: ${String(err)}`, "warning");
			} finally {
				running = false;
			}
		})();
	});
}
