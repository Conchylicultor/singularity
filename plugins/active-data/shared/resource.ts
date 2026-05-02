import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/shared";

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

export const activeDataBindingsResource = resourceDescriptor<
  ActiveDataBindingsPayload,
  { conversationId: string }
>("active-data.bindings", ActiveDataBindingsPayloadSchema);
