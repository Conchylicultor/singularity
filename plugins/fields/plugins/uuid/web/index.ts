import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Fields } from "@plugins/fields/web";
import { uuidIdentity } from "../core";

export default {
  description:
    "UUID field type: identity only, extends text — a string value primarily used as a storage/PK type, reusing text's cell and filter via the extends chain.",
  contributions: [Fields.Identity({ identity: uuidIdentity })],
} satisfies PluginDefinition;
