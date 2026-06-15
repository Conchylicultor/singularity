import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Fields } from "@plugins/fields/web";
import { tagsIdentity } from "../core";

export default {
  description:
    "Tags (multi-value) field type: identity only. The data-view filter (multi-select tag chips with array-aware match-any) lives in the plugins/filter sub-plugin.",
  contributions: [Fields.Identity({ identity: tagsIdentity })],
} satisfies PluginDefinition;
