import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { IdKinds } from "@plugins/ids/web";
import { sessionLinkIdKind } from "../core";

export default {
  description:
    "Registers the session-chain row id kind (sess) with the web id registry — the server barrel registers the same kind.",
  contributions: [IdKinds.Kind({ kind: sessionLinkIdKind })],
} satisfies PluginDefinition;
