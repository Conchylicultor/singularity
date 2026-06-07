import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Fields } from "@plugins/fields/web";
import { colorIdentity } from "../core";

export default {
  name: "Fields: Color",
  description:
    "Color field type: identity only. The read-only swatch cell lives in the plugins/table sub-plugin; color has no filter (sparse).",
  contributions: [Fields.Identity({ identity: colorIdentity })],
} satisfies PluginDefinition;
