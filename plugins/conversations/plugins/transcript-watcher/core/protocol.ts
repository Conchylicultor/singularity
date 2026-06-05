import { z } from "zod";

// Wire tag the agent reads in its first user turn. Named `special_instructions`
// (not `preprompt`) so the model reads it as an imperative to follow. The
// internal event kind stays `preprompt`; the UI label is "Instructions". This
// constant is the SINGLE SOURCE OF TRUTH shared by the launch injector
// (lifecycle.ts) and the transcript parser (parse-jsonl.ts) — a drift between
// the two would silently break extraction.
export const PREPROMPT_TAG = "special_instructions";

/** Wrap preprompt text for prepending to the first user turn. */
export function wrapPreprompt(text: string): string {
  return `<${PREPROMPT_TAG}>\n${text}\n</${PREPROMPT_TAG}>`;
}

/** Lift the first preprompt block out of `text`. Returns the inner text (or null) + the remainder. */
export function extractPreprompt(text: string): { preprompt: string | null; rest: string } {
  // Local regex (no `g` flag) — first match only; the preprompt is only ever
  // injected into the first user turn.
  const re = new RegExp(`<${PREPROMPT_TAG}>([\\s\\S]*?)</${PREPROMPT_TAG}>`);
  const m = re.exec(text);
  if (!m) return { preprompt: null, rest: text };
  const inner = m[1]!.trim();
  const rest = (text.slice(0, m.index) + text.slice(m.index + m[0].length)).trim();
  return { preprompt: inner ? inner : null, rest };
}

export const TokenUsageSchema = z.object({
  input: z.number().int(),
  output: z.number().int(),
  cacheRead: z.number().int(),
  cacheCreation: z.number().int(),
});
export type TokenUsage = z.infer<typeof TokenUsageSchema>;

const UserTextSegmentSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text"), value: z.string() }),
  z.object({ kind: z.literal("image"), mime: z.string(), data: z.string() }),
]);
export type UserTextSegment = z.infer<typeof UserTextSegmentSchema>;

const ToolCallResultSchema = z.object({
  at: z.string(),
  content: z.string(),
  isError: z.boolean().optional(),
});
export type ToolCallResult = z.infer<typeof ToolCallResultSchema>;

export const JsonlEventSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("user-text"),
    at: z.string(),
    text: z.string(),
    segments: z.array(UserTextSegmentSchema).optional(),
  }),
  z.object({
    kind: z.literal("user-image"),
    at: z.string(),
    mime: z.string(),
    data: z.string(),
  }),
  z.object({
    kind: z.literal("tool-call"),
    at: z.string(),
    messageId: z.string().optional(),
    toolUseId: z.string(),
    name: z.string(),
    input: z.unknown(),
    usage: TokenUsageSchema.optional(),
    result: ToolCallResultSchema.optional(),
    injectedContext: z.array(z.string()).optional(),
  }),
  z.object({
    kind: z.literal("assistant-thinking"),
    at: z.string(),
    messageId: z.string().optional(),
    thinking: z.string(),
  }),
  z.object({
    kind: z.literal("assistant-text"),
    at: z.string(),
    messageId: z.string().optional(),
    text: z.string(),
    stopReason: z.string().optional(),
    usage: TokenUsageSchema.optional(),
  }),
  z.object({
    kind: z.literal("system"),
    at: z.string(),
    subtype: z.string().optional(),
    text: z.string(),
  }),
  z.object({
    // Harness-injected prompt turns (loop/queue wakeups, "Continue from where
    // you left off.", local-command caveats). These are `type:"user"` lines
    // with `isMeta:true` — never authored by the human — so they must not
    // render as user messages.
    kind: z.literal("meta-prompt"),
    at: z.string(),
    source: z.string().optional(),
    text: z.string(),
  }),
  z.object({
    kind: z.literal("summary"),
    at: z.string(),
    text: z.string(),
  }),
  z.object({
    kind: z.literal("preprompt"),
    at: z.string(),
    text: z.string(),
  }),
  z.object({
    kind: z.literal("task-notification"),
    at: z.string(),
    taskId: z.string(),
    toolUseId: z.string().optional(),
    status: z.string(),
    summary: z.string(),
    outputFile: z.string().optional(),
    extra: z.record(z.string()).optional(),
  }),
  z.object({
    kind: z.literal("attachment"),
    at: z.string(),
    subtype: z.string(),
    attachment: z.unknown(),
  }),
  z.object({
    // Claude Code prompt-queue events: items enqueued, dequeued (sent to the
    // agent on its next turn), or removed without being sent. `type:
    // "queue-operation"` lines carry an `operation` discriminator and optional
    // `content` (a queued prompt, or a `<task-notification>` block from a
    // background task completion).
    kind: z.literal("queue-operation"),
    at: z.string(),
    operation: z.string(),
    content: z.string().optional(),
  }),
  z.object({
    kind: z.literal("unknown"),
    at: z.string(),
    type: z.string(),
    raw: z.unknown(),
  }),
]);
export type JsonlEvent = z.infer<typeof JsonlEventSchema>;
