type Block = { type?: string; text?: string; id?: string; name?: string; arguments?: unknown };
type PiEntry = {
  type?: string;
  id?: string;
  timestamp?: string;
  cwd?: string;
  modelId?: string;
  message?: { role?: string; content?: string | Block[]; toolCallId?: string };
};

type CodexPayload =
  | { type: "message"; role: "user"; content: { type: "input_text"; text: string }[] }
  | { type: "message"; role: "assistant"; content: { type: "output_text"; text: string }[] }
  | { type: "function_call"; name?: string; arguments: string; call_id?: string }
  | { type: "function_call_output"; call_id?: string; output: string }
  | { type?: undefined; cwd: string; model: string }
  | { type?: undefined; id: string; cwd: string; timestamp: string; originator: "pi" };

export type Rollout = { sessionId: string; startedAt: string; lines: string[] };

const blocks = (content: string | Block[] | undefined): Block[] =>
  typeof content === "string" ? [{ type: "text", text: content }] : (content ?? []);

const texts = (content: string | Block[] | undefined): string[] =>
  blocks(content).filter((b) => b.type === "text" && b.text).map((b) => b.text as string);

function parse(line: string): PiEntry | null {
  try {
    return JSON.parse(line) as PiEntry;
  } catch {
    return null;
  }
}

function assistantPayload(b: Block): CodexPayload[] {
  if (b.type === "text" && b.text) return [{ type: "message", role: "assistant", content: [{ type: "output_text", text: b.text }] }];
  if (b.type === "toolCall") return [{ type: "function_call", name: b.name, arguments: JSON.stringify(b.arguments ?? {}), call_id: b.id }];
  return [];
}

const payloadsByRole: Record<string, (m: NonNullable<PiEntry["message"]>) => CodexPayload[]> = {
  user: ({ content }) => texts(content).map((text) => ({ type: "message", role: "user", content: [{ type: "input_text", text }] })),
  toolResult: ({ content, toolCallId }) => [{ type: "function_call_output", call_id: toolCallId, output: texts(content).join("\n") }],
  assistant: ({ content }) => blocks(content).flatMap(assistantPayload),
};

const messagePayloads = ({ message }: PiEntry): CodexPayload[] =>
  (message?.role && payloadsByRole[message.role]?.(message)) || [];

type SessionHeader = { id: string; timestamp: string; cwd: string };

function findHeader(entries: PiEntry[]): SessionHeader | null {
  const header = entries.find((e) => e.type === "session");
  if (!header?.id || !header.timestamp) return null;
  return { id: header.id, timestamp: header.timestamp, cwd: header.cwd ?? "" };
}

function entryPayloads(entry: PiEntry, cwd: string): [string, CodexPayload][] {
  if (entry.type === "model_change" && entry.modelId) return [["turn_context", { cwd, model: entry.modelId }]];
  if (entry.type === "message") return messagePayloads(entry).map((p) => ["response_item", p]);
  return [];
}

export function toRollout(piLines: string[]): Rollout | null {
  const entries = piLines.map(parse).filter((e): e is PiEntry => e !== null);
  const header = findHeader(entries);
  if (!header) return null;
  const line = (timestamp: string | undefined, type: string, payload: CodexPayload) =>
    JSON.stringify({ timestamp: timestamp ?? header.timestamp, type, payload });
  const meta = line(header.timestamp, "session_meta", { ...header, originator: "pi" });
  const body = entries.flatMap((e) => entryPayloads(e, header.cwd).map(([type, p]) => line(e.timestamp, type, p)));
  return { sessionId: header.id, startedAt: header.timestamp, lines: [meta, ...body] };
}

export function rolloutRelativePath({ sessionId, startedAt }: Rollout): string {
  const [date, time] = startedAt.split("T");
  const [y, m, d] = date.split("-");
  const hms = time.slice(0, 8).replaceAll(":", "-");
  return `sessions/${y}/${m}/${d}/rollout-${date}T${hms}-${sessionId}.jsonl`;
}
