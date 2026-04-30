import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/shared";

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
    kind: z.literal("user-tool-result"),
    at: z.string(),
    toolUseId: z.string(),
    content: z.string(),
    isError: z.boolean().optional(),
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
    kind: z.literal("assistant-tool-use"),
    at: z.string(),
    messageId: z.string().optional(),
    toolUseId: z.string(),
    name: z.string(),
    input: z.unknown(),
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
]);
export type JsonlEvent = z.infer<typeof JsonlEventSchema>;

export const JsonlEventsPayloadSchema = z.array(JsonlEventSchema);

export interface JsonlEventsResponse {
  events: JsonlEvent[];
}

export const jsonlEventsResource = resourceDescriptor<JsonlEvent[], { id: string }>(
  "jsonl-events",
  JsonlEventsPayloadSchema,
);
