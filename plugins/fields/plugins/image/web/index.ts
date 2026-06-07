import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Fields } from "@plugins/fields/web";
import { imageIdentity } from "../core";

export default {
  name: "Fields: Image",
  description:
    "Image field type: identity only. The read-only thumbnail cell lives in the plugins/table sub-plugin; image is a data-view-only media type with no filter (sparse).",
  contributions: [Fields.Identity({ identity: imageIdentity })],
} satisfies PluginDefinition;
