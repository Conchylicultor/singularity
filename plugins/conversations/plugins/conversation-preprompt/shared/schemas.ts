import { z } from "zod";
import type { ZodParser } from "@plugins/packages/plugins/zod-parser/core";
import { pointQueryResourceDescriptor } from "@plugins/infra/plugins/query-resource/core";
import type { AvatarSpec, SvgNode } from "@plugins/fields/plugins/avatar/core";

// Snapshot of the chosen preprompt avatar (icon key + color + rendered svg
// nodes), and the decoder for the `conversations_ext_preprompt.icon` column.
//
// The TYPE is the canonical `AvatarSpec` — a type-only import, so it is erased
// and this module (and the `tables.ts` that imports it) stays free of the
// `react-icons` value the avatar field plugin pulls in for its identity icon.
// Annotating the schema `ZodParser<AvatarSpec>` is what pins the two together:
// a shape that drifts from the interface stops compiling here.
//
// `SvgNode` is recursive through `child`, so its schema needs `z.lazy`.
const SvgNodeSchema: ZodParser<SvgNode> = z.lazy(() =>
  z.object({
    tag: z.string(),
    attr: z.record(z.string()),
    child: z.array(SvgNodeSchema),
  }),
);
export const AvatarSpecSchema: ZodParser<AvatarSpec> = z.object({
  icon: z.string().nullable(),
  color: z.string().nullable(),
  svgNodes: z.array(SvgNodeSchema).nullable(),
});
// The wire/row field is nullable (a preprompt may have no icon); the column
// leaves `.notNull()` off and hands the decoder the inner schema, which is
// never shown a `null`.
const PrepromptIconSchema = AvatarSpecSchema.nullable();
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
