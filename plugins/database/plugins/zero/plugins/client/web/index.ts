import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { ZeroRoot } from "./zero-root";
export { useZeroResource, useZeroQuery } from "./use-zero-resource";

export default {
  description:
    "Generic, schema-parameterized Zero client: the ZeroRoot provider wrapper, the useZeroResource (ResourceResult-shaped) adapter, and a raw useZeroQuery re-export. No concrete schema.",
} satisfies PluginDefinition;
