import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Fields } from "@plugins/fields/web";
import { iconIdentity } from "../core";

export default {
  description:
    "Icon field type: identity only. The config-render capability and the iconField factory live in the plugins/config sub-plugin.",
  contributions: [Fields.Identity({ identity: iconIdentity })],
} satisfies PluginDefinition;
