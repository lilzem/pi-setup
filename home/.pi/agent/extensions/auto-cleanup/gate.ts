import { createHash } from "node:crypto";
import * as fs from "node:fs";

const GIT_COMMIT_OR_PUSH = /\bgit\s+(?:-C\s+\S+\s+)?(?:commit|push)\b/;

export function isGitCommitOrPush(command: string): boolean {
	return GIT_COMMIT_OR_PUSH.test(command);
}

export function bashCommand(event: { toolName: string; input: unknown }): string | null {
	if (event.toolName !== "bash") return null;
	const command = (event.input as { command?: unknown } | null)?.command;
	return typeof command === "string" ? command : null;
}

export type Snapshot = Map<string, string>;

function contentHash(file: string): string {
	try {
		return createHash("sha1").update(fs.readFileSync(file)).digest("hex");
	} catch {
		return "missing";
	}
}

export function snapshot(files: string[]): Snapshot {
	return new Map(files.map((file) => [file, contentHash(file)]));
}

export function modifiedSince(before: Snapshot): string[] {
	return [...before].filter(([file, hash]) => contentHash(file) !== hash).map(([file]) => file);
}

export interface GateDeps {
	activeRun(): Promise<unknown> | null;
	runPending(): Promise<void>;
	drainChanged(): string[];
	notify(message: string): void;
}

export interface GateBlock {
	block: true;
	reason: string;
}

function blockReason(files: string[]): string {
	return [
		"auto-cleanup changed these files after your last edit:",
		...files.map((file) => `  - ${file}`),
		"",
		"Review the fixes with git diff, stage them, then run the same git command again,",
		"so the fixes go into this commit and no second cleanup commit is needed.",
	].join("\n");
}

export async function gateGitCommand(
	command: string,
	deps: GateDeps,
): Promise<GateBlock | undefined> {
	if (!isGitCommitOrPush(command)) return undefined;
	const active = deps.activeRun();
	if (active) {
		deps.notify("Cleanup: git commit/push waits for the running cleanup...");
		await active;
	}
	await deps.runPending();
	const changed = deps.drainChanged();
	if (changed.length === 0) return undefined;
	return { block: true, reason: blockReason(changed) };
}
