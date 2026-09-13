import { z } from "zod";
import type { ZodParser } from "@plugins/packages/plugins/zod-parser/core";
import { pointQueryResourceDescriptor } from "@plugins/infra/plugins/query-resource/core";
import type { AvatarSpec, SvgNode } from "@plugins/fields/plugins/avatar/core";
import { nullable } from "@plugins/fields/core";
import { textField } from "@plugins/fields/plugins/text/plugins/config/core";
import { jsonField } from "@plugins/fields/plugins/json/plugins/config/core";
import { defineExtensionShape } from "@plugins/infra/plugins/entity-extensions/core";

// Snapshot of the chosen preprompt avatar (icon key + color + rendered svg
// nodes), and the decoder for the `conversations_ext_preprompt.icon` column.
//
// The TYPE is the canonical `AvatarSpec` — a type-only import, so it is erased
// and this module never loads the avatar field plugin's runtime. Annotating the
// schema `ZodParser<AvatarSpec>` is what pins the two together: a shape that
// drifts from the interface stops compiling here.
//
// `SvgNode` is recursive through `child`, so its schema needs `z.lazy`.
const SvgNodeSchema: ZodParser<SvgNode> = z.lazy(() =>
  z.object({
    tag: z.string(),
    attr: z.record(z.string()),
    child: z.array(SvgNodeSchema),
  }),
);
const AvatarSpecSchema: ZodParser<AvatarSpec> = z.object({
  icon: z.string().nullable(),
  color: z.string().nullable(),
  svgNodes: z.array(SvgNodeSchema).nullable(),
});
// The wire/row field is nullable (a preprompt may have no icon). `nullable()`
// leaves the column's `.notNull()` off, and the jsonb decoder is handed the
// inner schema, which is never shown a `null`. The `default` is only the
// field's wire default — `nullable()` replaces it with `null`.
const prepromptIconField = nullable(
  jsonField({
    schema: AvatarSpecSchema,
    default: { icon: null, color: null, svgNodes: null },
  }),
);
export type PrepromptIcon = AvatarSpec | null;

// The `conversations_ext_preprompt` row, declared once: `server/internal/
// tables.ts` builds the side-table from this shape, and the wire row is its
// `schema`. `text` is stored as `prompt_text` (a DB-only name, set in
// `tables.ts`); `updatedAt` is the one timestamp put on the wire.
export const conversationPrepromptShape = defineExtensionShape({
  key: "conversationId",
  fields: {
    prepromptId: textField(),
    title: textField(),
    text: textField(),
    icon: prepromptIconField,
  },
  wireTimestamps: ["updatedAt"],
});
export const ConversationPrepromptSchema = conversationPrepromptShape.schema;
export type ConversationPreprompt = z.infer<typeof ConversationPrepromptSchema>;

// Bounded POINT resource: a consumer subscribes by an explicit conversation-id
// set (`usePointResource(resource, convId)` → one row-or-null), so a preprompt
// read costs O(1) instead of an O(n) lookup over the whole `{convId → row}`
// record. Rows key on `conversationId` — the extension's key, whose column is
// the side-table's `parent_id` PK (which IS the point identity).
// NOT bootCritical: point resources hydrate post-mount (the recorded decision),
// and the chip/sidebar icons stay unrendered for the one round-trip.
export const conversationPrepromptsResource =
  pointQueryResourceDescriptor<ConversationPreprompt>(
    "conversation-preprompts",
    ConversationPrepromptSchema,
    "conversationId",
  );
