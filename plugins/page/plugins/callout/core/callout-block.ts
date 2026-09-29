import { z } from "zod";
import { SavedSymbolNameSchema } from "@plugins/ui/plugins/icons/plugins/saved-names/core";
import { defineContainerBlock } from "@plugins/page/plugins/container/core";
import { symbol } from "@plugins/ui/plugins/icons/core";

const lightbulbIcon = symbol("lightbulb");

export const CALLOUT_COLORS = [
  "default",
  "info",
  "success",
  "warning",
  "danger",
] as const;
export type CalloutColor = (typeof CALLOUT_COLORS)[number];

/**
 * A callout is a VOID container: it owns appearance only, never content.
 *
 * The schema deliberately does NOT compose `textBlockSchema` — and no longer
 * *can*: `defineContainerBlock` constrains its schema to a shape without `text`,
 * so a text-bearing container is a compile error. `acceptsText` is *derived*
 * from the schema (`"text" in schema.shape`), so voidness falls out with no new
 * flag, and the write boundary's strict parse then rejects a stray `text` key
 * outright — which is what makes the data migration's own guard
 * (`WHERE data ? 'text'`) idempotent rather than aspirational.
 */
export const calloutDataSchema = z.object({
  // The picked Material Symbols name, drawn as a runtime symbol (and
  // highlighted in the picker grid); null = the default lightbulb.
  icon: SavedSymbolNameSchema.nullable().default(null),
  // Semantic tint; maps to theme color tokens in the web renderer.
  color: z.enum(CALLOUT_COLORS).default("default"),
});

/**
 * `defineContainerBlock` — not `defineBlock` — is what makes this a container.
 * It FORCES `anchor: true` and `wrapOnConvert: true`,
 * the two facts that are only correct together (see
 * `@plugins/page/plugins/container/core`), so this file declares nothing but the
 * callout's own identity and appearance payload.
 */
export const calloutBlock = defineContainerBlock({
  type: "callout",
  schema: calloutDataSchema,
  label: "Callout",
  icon: lightbulbIcon,
  aliases: ["note", "info", "warning", "tip", "aside", "highlight", "banner"],
  empty: () => ({
    icon: null,
    color: "default" as CalloutColor,
  }),
});
