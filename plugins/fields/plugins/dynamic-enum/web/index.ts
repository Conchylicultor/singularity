import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Fields } from "@plugins/fields/web";
import { dynamicEnumIdentity } from "../core";

export default {
  description:
    "Dynamic enum (select) field type: identity only. Options are resolved at config-render time via the plugins/config sub-plugin's slot.",
  contributions: [Fields.Identity({ identity: dynamicEnumIdentity })],
} satisfies PluginDefinition;
