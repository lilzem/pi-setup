import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { findViolations, formatFeedback } from "./check.ts";

const RULE = [
	"Write replies to the user in Simplified Technical English (ASD-STE100).",
	"- One topic per sentence. Procedure sentences: max 20 words. Descriptive sentences: max 25 words.",
	"- Use the imperative for instructions and the active voice.",
	"- Use one word for one meaning. Use simple verb tenses.",
	"- Write steps as a numbered list, one action per step.",
	"- Do not use contractions, idioms, slang, filler, or phrasal verbs.",
	"- Keep code, commands, file paths, and identifiers exactly as they are.",
].join("\n");

type TextPart = { type: string; text?: string };

function replyText(content: TextPart[]): string {
	return content
		.filter((part) => part.type === "text")
		.map((part) => part.text)
		.join("\n");
}

export default function steStyleExtension(pi: ExtensionAPI) {
	let rewriteRequested = false;

	pi.on("before_agent_start", async (event) => {
		if (event.messageType === "user") rewriteRequested = false;
		return { systemPrompt: `${event.systemPrompt}\n\n## Response style\n\n${RULE}` };
	});

	pi.on("turn_end", async (event, ctx) => {
		if (rewriteRequested || event.outcome !== "completed" || event.toolResults.length > 0) return undefined;

		const violations = findViolations(replyText((event.message as { content: TextPart[] }).content));
		if (violations.length === 0) return undefined;

		rewriteRequested = true;
		if (ctx.hasUI) ctx.ui.notify(`STE: ${violations.length} violation(s), requesting a rewrite`, "warning");
		return {
			entries: [
				...event.entries,
				{ type: "custom_message", customType: "ste-rewrite", content: formatFeedback(violations), display: false },
			],
			continue: true,
		};
	});
}
