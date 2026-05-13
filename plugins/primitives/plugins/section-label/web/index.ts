import type { PluginDefinition } from "@core";

export { SectionLabel, type SectionLabelProps } from "./internal/section-label";

export default {
  id: "section-label",
  name: "Section Label",
  description:
    "Eyebrow/section-label typography primitive: small caps muted label for form sections and content headers.",
  contributions: [],
} satisfies PluginDefinition;
