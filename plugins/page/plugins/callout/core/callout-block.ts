import { z } from "zod";
import { MdLightbulb } from "react-icons/md";
import { defineBlock, SvgNodeSchema } from "@plugins/page/plugins/editor/core";

export const CALLOUT_COLORS = ["default", "info", "success", "warning", "danger"] as const;
export type CalloutColor = (typeof CALLOUT_COLORS)[number];

/**
 * A callout is a VOID container: it owns appearance only, never content.
 *
 * The schema deliberately does NOT compose `textBlockSchema`. `acceptsText` is
 * *derived* from the schema (`"text" in schema.shape`), so voidness falls out
 * with no new flag, and the write boundary's strict parse then rejects a stray
 * `text` key outright — which is what makes the data migration's own guard
 * (`WHERE data ? 'text'`) idempotent rather than aspirational.
 */
export const calloutDataSchema = z.object({
  // Material Design icon key (highlights the current icon in the picker grid).
  icon: z.string().nullable().default(null),
  // The icon's extracted SVG child-tree, rendered without importing any icon module.
  iconSvgNodes: z.array(SvgNodeSchema).nullable().default(null),
  // Semantic tint; maps to theme color tokens in the web renderer.
  color: z.enum(CALLOUT_COLORS).default("default"),
});

export const calloutBlock = defineBlock({
  type: "callout",
  schema: calloutDataSchema,
  label: "Callout",
  icon: MdLightbulb,
  aliases: ["note", "info", "warning", "tip", "aside", "highlight", "banner"],
  empty: () => ({ icon: null, iconSvgNodes: null, color: "default" as CalloutColor }),
  // The callout renders NO line of its own: its content IS its children, and the
  // surface paints its icon in the indent gutter left of the first child. That is
  // what makes converting a child to a heading (or splitting it with Enter) a
  // plain operation on an ordinary block that cannot touch the container.
  anchor: true,
  // `/callout` on an existing block WRAPS it — the origin keeps its id, type,
  // data and children and becomes the anchor's first child — rather than retyping
  // it. So a heading, to-do, image or code block can be put in a callout, and the
  // caret never moves (block-id-keyed content doc / undo manager / focus handle).
  wrapOnConvert: true,
  // An anchor has no chevron to reopen it, and every creation path mints
  // `expanded: false`. Making the stored flag inert is the only guarantee.
  collapsible: "never",
});
