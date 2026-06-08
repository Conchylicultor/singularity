import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Fields } from "@plugins/fields/web";
import { stringListIdentity } from "../core";

export default {
  name: "Fields: String List",
  description:
    "String-list field type: identity only. The config-render capability and the stringListField factory live in the plugins/config sub-plugin.",
  contributions: [Fields.Identity({ identity: stringListIdentity })],
} satisfies PluginDefinition;
