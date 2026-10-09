import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { IdKinds } from "@plugins/ids/web";
import { versionIdKind } from "../core";

export default {
  description:
    "Registers the version id kind (ver) with the web id registry — the server barrel registers the same kind.",
  contributions: [IdKinds.Kind({ kind: versionIdKind })],
} satisfies PluginDefinition;
