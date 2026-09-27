import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import "./internal/register";
import { configSecretMetaServed } from "./internal/resource";

export default {
  description:
    "Secret field type: encrypted storage with set/not-set metadata.",
  contributions: [...configSecretMetaServed.declare],
} satisfies ServerPluginDefinition;
