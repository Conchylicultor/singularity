import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Fields } from "@plugins/fields/web";
import { multilineTextIdentity } from "../core";

export default {
  name: "Fields: Long text",
  description:
    "Long text field type: identity only, extends text — reuses text's cell and filter via the extends chain.",
  contributions: [Fields.Identity({ identity: multilineTextIdentity })],
} satisfies PluginDefinition;
