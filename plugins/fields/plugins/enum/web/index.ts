import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Fields } from "@plugins/fields/web";
import { enumIdentity } from "../core";

export default {
  name: "Fields: Enum",
  description:
    "Enum (select) field type: identity only. The config-render capability lives in the plugins/config sub-plugin; table/filter capabilities are deferred to task 3.",
  contributions: [Fields.Identity({ identity: enumIdentity })],
} satisfies PluginDefinition;
