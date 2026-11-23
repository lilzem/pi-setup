export type Violation = {
	kind: "long-sentence" | "banned-term";
	text: string;
	term?: string;
	detail: string;
};

const DESCRIPTIVE_MAX_WORDS = 25;
const PROCEDURE_MAX_WORDS = 20;

const BANNED_TERMS: Record<string, string> = {
	"I'm": "contraction",
	"I've": "contraction",
	"I'll": "contraction",
	"I'd": "contraction",
	"don't": "contraction",
	"doesn't": "contraction",
	"didn't": "contraction",
	"isn't": "contraction",
	"aren't": "contraction",
	"wasn't": "contraction",
	"can't": "contraction",
	"won't": "contraction",
	"shouldn't": "contraction",
	"it's": "contraction",
	"that's": "contraction",
	"there's": "contraction",
	"let's": "contraction",
	"you're": "contraction",
	"we're": "contraction",
	"they're": "contraction",
	"figure out": "phrasal verb",
	"find out": "phrasal verb",
	"set up": "phrasal verb",
	"look into": "phrasal verb",
	"check out": "phrasal verb",
	"carry out": "phrasal verb",
	"point out": "phrasal verb",
	"come up with": "phrasal verb",
	"go through": "phrasal verb",
	"turn out": "phrasal verb",
	"end up": "phrasal verb",
	"fire up": "phrasal verb",
	"get rid of": "phrasal verb",
	"make sure": "phrasal verb",
	"basically": "filler",
	"actually": "filler",
	"just": "filler",
	"simply": "filler",
	"really": "filler",
	"pretty much": "filler",
	"kind of": "filler",
	"sort of": "filler",
	"a bunch of": "filler",
	"under the hood": "idiom",
	"out of the box": "idiom",
	"on the fly": "idiom",
	"heads up": "idiom",
	"prod": "slang",
	"gonna": "slang",
	"wanna": "slang",
	"stuff": "slang",
	"tweak": "slang",
};

const BANNED_PATTERNS = Object.entries(BANNED_TERMS).map(([term, category]) => ({
	term,
	category,
	pattern: new RegExp(`(?<![\\w'])${term.replace(/'/g, "['’]")}(?![\\w'])`, "i"),
}));

function stripNonProse(text: string): string[] {
	return text
		.replace(/```[\s\S]*?```/g, "")
		.replace(/`[^`\n]*`/g, "CODE")
		.replace(/https?:\/\/\S+/g, "URL")
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => !line.startsWith("|"));
}

function isProcedureStep(line: string): boolean {
	return /^\d+[.)]\s/.test(line);
}

function stripListMarker(line: string): string {
	return line.replace(/^(\d+[.)]|[-*+]|#+|>)\s+/, "");
}

function splitSentences(line: string): string[] {
	return stripListMarker(line).split(/(?<=[.!?])\s+/);
}

function countWords(sentence: string): number {
	return sentence.split(/\s+/).filter((token) => /[\p{L}\p{N}]/u.test(token)).length;
}

function sentenceLengthViolations(line: string): Violation[] {
	const max = isProcedureStep(line) ? PROCEDURE_MAX_WORDS : DESCRIPTIVE_MAX_WORDS;
	return splitSentences(line)
		.map((sentence) => ({ sentence, words: countWords(sentence) }))
		.filter(({ words }) => words > max)
		.map(({ sentence, words }) => ({
			kind: "long-sentence",
			text: sentence,
			detail: `${words} words (max ${max})`,
		}));
}

function bannedTermViolations(line: string): Violation[] {
	return BANNED_PATTERNS.filter(({ pattern }) => pattern.test(line)).map(({ term, category }) => ({
		kind: "banned-term",
		text: line,
		term,
		detail: category,
	}));
}

export function findViolations(text: string): Violation[] {
	return stripNonProse(text).flatMap((line) => [...sentenceLengthViolations(line), ...bannedTermViolations(line)]);
}

function describe(violation: Violation): string {
	if (violation.kind === "banned-term") return `- "${violation.term}" (${violation.detail}) in: ${violation.text}`;
	return `- Sentence too long, ${violation.detail}: ${violation.text}`;
}

export function formatFeedback(violations: Violation[]): string {
	return [
		"Your last reply broke the Simplified Technical English (ASD-STE100) rules:",
		...violations.map(describe),
		"Rewrite the complete reply in Simplified Technical English. Keep the same facts, code, commands and paths. Do not mention this check.",
	].join("\n");
}
