import type { PluginDefinition } from "@core";

export { ActiveData } from "./slots";
export type { ActiveDataTagContribution } from "./slots";
export { useActiveDataRenderer } from "./internal/render-active-data";
export {
  parseActiveData,
  ACTIVE_DATA_TAG_RE,
} from "./internal/parse";
export type { ActiveDataSegment } from "./internal/parse";

export default {
  id: "active-data",
  name: "Active Data",
  description:
    "Meta plugin for inline interactive widgets agents render via XML-like tags in assistant text. Sub-plugins claim a tag name and ship its rendered component; hosts call useActiveDataRenderer() inside react-markdown component overrides.",
  contributions: [],
} satisfies PluginDefinition;
