import { z } from "zod";
import { pointQueryResourceDescriptor } from "@plugins/infra/plugins/query-resource/core";

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

// Bounded POINT resource: a consumer subscribes by an explicit conversation-id
// set (`usePointResource(resource, convId)` → one row-or-null), so a preprompt
// read costs O(1) instead of an O(n) lookup over the whole `{convId → row}`
// record. Rows key on `conversationId` — the ALIAS the server projection
// exposes the side-table's `parent_id` PK under (which IS the point identity).
// NOT bootCritical: point resources hydrate post-mount (the recorded decision),
// and the chip/sidebar icons stay unrendered for the one round-trip.
export const conversationPrepromptsResource =
  pointQueryResourceDescriptor<ConversationPreprompt>(
    "conversation-preprompts",
    ConversationPrepromptSchema,
    "conversationId",
  );
