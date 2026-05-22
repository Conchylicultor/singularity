import { z } from "zod";

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
    kind: z.literal("summary"),
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
]);
export type JsonlEvent = z.infer<typeof JsonlEventSchema>;
