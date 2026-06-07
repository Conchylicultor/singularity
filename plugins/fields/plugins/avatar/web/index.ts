import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Fields } from "@plugins/fields/web";
import { avatarIdentity } from "../core";

export default {
  name: "Fields: Avatar",
  description:
    "Avatar field type: identity only. The config-render capability and the avatarField factory live in the plugins/config sub-plugin.",
  contributions: [Fields.Identity({ identity: avatarIdentity })],
} satisfies PluginDefinition;
