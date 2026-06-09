import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Fields } from "@plugins/fields/web";
import { listIdentity } from "../core";

export default {
  description:
    "List field type: identity only. The config-render capability and the listField factory live in the plugins/config sub-plugin.",
  contributions: [Fields.Identity({ identity: listIdentity })],
} satisfies PluginDefinition;
