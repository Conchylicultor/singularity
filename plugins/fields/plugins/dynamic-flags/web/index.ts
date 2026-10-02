import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Fields } from "@plugins/fields/web";
import { dynamicFlagsIdentity } from "../core";

export default {
  description:
    "Dynamic flags (toggles) field type: identity only. Options and their defaults are resolved at config-render time via the plugins/config sub-plugin's slot.",
  contributions: [Fields.Identity({ identity: dynamicFlagsIdentity })],
} satisfies PluginDefinition;
