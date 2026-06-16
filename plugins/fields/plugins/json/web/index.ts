import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Fields } from "@plugins/fields/web";
import { jsonIdentity } from "../core";

export default {
  description:
    "JSON field type: identity only. The config-render capability and the jsonField factory live in the plugins/config sub-plugin.",
  contributions: [Fields.Identity({ identity: jsonIdentity })],
} satisfies PluginDefinition;
