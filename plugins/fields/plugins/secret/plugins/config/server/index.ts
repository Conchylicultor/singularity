import { Resource } from "@plugins/framework/plugins/server-core/core";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import "./internal/register";
import { secretMetaServerResource } from "./internal/resource";

export default {
  name: "Fields: Secret Config",
  description: "Secret field type: encrypted storage with set/not-set metadata.",
  contributions: [Resource.Declare(secretMetaServerResource)],
} satisfies ServerPluginDefinition;
