import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Fields } from "@plugins/fields/web";
import { variantIdentity } from "../core";

export default {
  description:
    "Variant field type: identity only. The config-render capability and the variantField factory live in the plugins/config sub-plugin.",
  contributions: [Fields.Identity({ identity: variantIdentity })],
} satisfies PluginDefinition;
