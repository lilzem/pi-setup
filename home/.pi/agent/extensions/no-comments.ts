import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const RULE = "Do not write comments in code unless explicitly asked to. Write self-explanatory code instead.";

const hashCommentExtensions = new Set([
	".py",
	".rb",
	".sh",
	".bash",
	".zsh",
	".yaml",
	".yml",
	".toml",
	".pl",
	".r",
	".tf",
]);

const slashCommentExtensions = new Set([
	".js",
	".jsx",
	".ts",
	".tsx",
	".mjs",
	".cjs",
	".c",
	".h",
	".cc",
	".cpp",
	".hpp",
	".cs",
	".java",
	".go",
	".rs",
	".swift",
	".kt",
	".kts",
	".scala",
	".php",
	".m",
	".mm",
	".dart",
	".sql",
]);

function stripStrings(line: string): string {
	return line
		.replace(/"(?:[^"\\]|\\.)*"/g, '""')
		.replace(/'(?:[^'\\]|\\.)*'/g, "''")
		.replace(/`(?:[^`\\]|\\.)*`/g, "``");
}

function lineHasComment(rawLine: string, ext: string): boolean {
	const line = rawLine.trim();
	if (line.length === 0) return false;
	if (line.startsWith("#!")) return false;

	const scanned = stripStrings(rawLine);

	if (slashCommentExtensions.has(ext)) {
		if (/\/\*/.test(scanned) || /\*\//.test(scanned)) return true;
		const slashIndex = scanned.indexOf("//");
		if (slashIndex !== -1 && scanned[slashIndex - 1] !== ":") return true;
	}

	if (hashCommentExtensions.has(ext)) {
		if (/(^|\s)#/.test(scanned)) return true;
	}

	return false;
}

function findCommentLines(content: string, ext: string): number[] {
	const lines = content.split("\n");
	const offending: number[] = [];
	let inBlockComment = false;

	for (let i = 0; i < lines.length; i++) {
		const scanned = stripStrings(lines[i]);

		if (inBlockComment) {
			offending.push(i + 1);
			if (scanned.includes("*/")) inBlockComment = false;
			continue;
		}

		if (lineHasComment(lines[i], ext)) {
			offending.push(i + 1);
			if (slashCommentExtensions.has(ext) && /\/\*/.test(scanned) && !/\*\//.test(scanned)) {
				inBlockComment = true;
			}
		}
	}

	return offending;
}

export default function noCommentsExtension(pi: ExtensionAPI) {
	pi.on("before_agent_start", async (event) => {
		return {
			systemPrompt: `${event.systemPrompt}\n\n## Code comments\n\n${RULE}`,
		};
	});

	pi.on("tool_call", async (event, ctx) => {
		if (event.toolName !== "write" && event.toolName !== "edit") return undefined;

		const filePath = event.input.path as string | undefined;
		if (!filePath) return undefined;

		const ext = path.extname(filePath).toLowerCase();
		if (!slashCommentExtensions.has(ext) && !hashCommentExtensions.has(ext)) {
			return undefined;
		}

		const chunks: string[] = [];
		if (event.toolName === "write") {
			const content = event.input.content as string | undefined;
			if (content) chunks.push(content);
		} else {
			const edits = event.input.edits as Array<{ newText?: string }> | undefined;
			for (const edit of edits ?? []) {
				if (edit.newText) chunks.push(edit.newText);
			}
		}

		for (const chunk of chunks) {
			const offending = findCommentLines(chunk, ext);
			if (offending.length > 0) {
				if (ctx.hasUI) {
					ctx.ui.notify(`Blocked comment in ${path.basename(filePath)}`, "warning");
				}
				return {
					block: true,
					reason: `${RULE} Detected comment(s) in ${filePath}. Rewrite the code without comments and resubmit.`,
				};
			}
		}

		return undefined;
	});
}
