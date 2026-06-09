import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Fields } from "@plugins/fields/web";
import { intIdentity } from "../core";

export default {
  description:
    "Integer field type: identity only, extends number — reuses number's cell and filter via the extends chain.",
  contributions: [Fields.Identity({ identity: intIdentity })],
} satisfies PluginDefinition;
