import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Fields } from "@plugins/fields/web";
import { floatIdentity } from "../core";

export default {
  name: "Fields: Float",
  description:
    "Float field type: identity only, extends number — reuses number's cell and filter via the extends chain.",
  contributions: [Fields.Identity({ identity: floatIdentity })],
} satisfies PluginDefinition;
