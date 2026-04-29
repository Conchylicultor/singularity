import type { PluginDefinition } from "@core";

export { ActiveData } from "./slots";
export type { ActiveDataTagContribution } from "./slots";
export { useActiveDataComponents } from "./internal/render-active-data";
export { useActiveDataLinkify } from "./internal/linkify-active-data";

export default {
  id: "active-data",
  name: "Active Data",
  description:
    "Meta plugin for inline interactive widgets agents render via XML-like tags in assistant text. Sub-plugins claim a tag name and ship its rendered component; hosts merge useActiveDataComponents() into their react-markdown components map (paired with rehype-raw).",
  contributions: [],
} satisfies PluginDefinition;
