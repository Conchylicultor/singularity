import { z } from "zod";
import { MdLightbulb } from "react-icons/md";
import { defineBlock, SvgNodeSchema, textBlockSchema } from "@plugins/page/plugins/editor/core";

export const CALLOUT_COLORS = ["default", "info", "success", "warning", "danger"] as const;
export type CalloutColor = (typeof CALLOUT_COLORS)[number];

export const calloutDataSchema = textBlockSchema({
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
  empty: () => ({ text: "", icon: null, iconSvgNodes: null, color: "default" as CalloutColor }),
  placeholder: "Type something…",
  // The tinted box adds an `Inset y="xs"` on top of the text editor's own `py-xs`,
  // so the first line sits one extra `--space-xs` lower than a plain text block.
  gutterFirstLineCenter: "calc(var(--space-xs) * 2 + var(--doc-lh-body) / 2)",
});
