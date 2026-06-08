import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Fields } from "@plugins/fields/web";
import { secretIdentity } from "../core";

export default {
  name: "Fields: Secret",
  description:
    "Secret field type: identity only. The config-render/storage/central capabilities and the secretField factory live in the plugins/config sub-plugin. Registers NO coerce and contributes NO data-view cell/filter, so a secret can never become a readable table cell.",
  contributions: [Fields.Identity({ identity: secretIdentity })],
} satisfies PluginDefinition;
