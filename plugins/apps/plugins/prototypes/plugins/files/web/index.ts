import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { IdKinds } from "@plugins/ids/web";
import { protoIdKind } from "../core";

export default {
  description:
    "Registers the prototype id kind (`proto-…`) in the browser's id-kind registry.",
  contributions: [IdKinds.Kind({ kind: protoIdKind })],
} satisfies PluginDefinition;
