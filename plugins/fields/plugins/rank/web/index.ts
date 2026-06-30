import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Fields } from "@plugins/fields/web";
import { rankIdentity } from "../core";

export default {
  description:
    "Rank field type: identity only, extends text — a fractional-indexing string stored in the rank_text (C-collation) domain, reusing text's cell and filter via the extends chain.",
  contributions: [Fields.Identity({ identity: rankIdentity })],
} satisfies PluginDefinition;
