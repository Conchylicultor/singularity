import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Fields } from "@plugins/fields/web";
import { directoryPathIdentity } from "../core";

export default {
  description:
    "Directory-path field type: identity only. The config-render capability (a folder picker) and the dirPathField factory live in the plugins/config sub-plugin.",
  contributions: [Fields.Identity({ identity: directoryPathIdentity })],
} satisfies PluginDefinition;
