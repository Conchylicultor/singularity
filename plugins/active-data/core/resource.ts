import { z } from "zod";
import { liveValue } from "@plugins/network/plugins/live/core";

export const ActiveDataBindingSchema = z.object({
  messageId: z.string(),
  tag: z.string(),
  occurrenceIndex: z.number().int().nonnegative(),
  payload: z.unknown(),
});
export type ActiveDataBinding = z.infer<typeof ActiveDataBindingSchema>;

export const ActiveDataBindingsPayloadSchema = z.array(ActiveDataBindingSchema);
export type ActiveDataBindingsPayload = z.infer<
  typeof ActiveDataBindingsPayloadSchema
>;

// One conversation's widget bindings, pushed whole: every widget of the
// conversation reads the same `{ conversationId }` tuple and picks its own row
// by `(messageId, tag, occurrenceIndex)`. A value, not a collection: the table's
// primary key is that composite, so there is no single id a `:rows` read could
// key on. The server states the bound (`unbounded: { reason }`). No
// placeholder: before the first value lands the read is `pending`.
export const activeDataBindings = liveValue("active-data.bindings", {
  schema: ActiveDataBindingsPayloadSchema,
  params: ["conversationId"],
});
