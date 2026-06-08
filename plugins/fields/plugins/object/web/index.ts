import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Fields } from "@plugins/fields/web";
import { objectIdentity } from "../core";

export default {
  name: "Fields: Object",
  description:
    "Object field type: identity only. The config-render capability and the objectField factory live in the plugins/config sub-plugin.",
  contributions: [Fields.Identity({ identity: objectIdentity })],
} satisfies PluginDefinition;
