import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";

// Snapshot of the chosen preprompt avatar (icon key + color + rendered svg
// nodes). Mirrors config_v2's AvatarSpec; kept self-contained so this shared
// module stays runtime-validatable without depending on the field plugin.
interface SvgNode {
  tag: string;
  attr: Record<string, string>;
  child: SvgNode[];
}
const SvgNodeSchema: z.ZodType<SvgNode> = z.lazy(() =>
  z.object({
    tag: z.string(),
    attr: z.record(z.string()),
    child: z.array(SvgNodeSchema),
  }),
);
const PrepromptIconSchema = z
  .object({
    icon: z.string().nullable(),
    color: z.string().nullable(),
    svgNodes: z.array(SvgNodeSchema).nullable(),
  })
  .nullable();
export type PrepromptIcon = z.infer<typeof PrepromptIconSchema>;

export const ConversationPrepromptSchema = z.object({
  conversationId: z.string(),
  prepromptId: z.string(),
  title: z.string(),
  text: z.string(),
  icon: PrepromptIconSchema,
  updatedAt: z.coerce.date(),
});
export type ConversationPreprompt = z.infer<typeof ConversationPrepromptSchema>;

export const ConversationPrepromptsPayloadSchema = z.record(
  z.string(),
  ConversationPrepromptSchema,
);
export type ConversationPrepromptsPayload = z.infer<
  typeof ConversationPrepromptsPayloadSchema
>;

export const conversationPrepromptsResource = resourceDescriptor<ConversationPrepromptsPayload>(
  "conversation-preprompts",
  ConversationPrepromptsPayloadSchema,
  {},
);
