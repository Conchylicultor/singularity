import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { InlineTokenReferentSource } from "@plugins/primitives/plugins/text-editor/plugins/inline-chip/server";
import { BLOCK_ID_RE } from "../core";
import { resolveBlockReferent } from "./internal/referent";

export default {
  description:
    "Resolves a bare `block-<id>` to what its chip shows — the page's title, or '<page title> › <block type>' for a content block — for model-read text (InlineTokenReferentSource).",
  contributions: [
    InlineTokenReferentSource({
      kind: "page",
      pattern: BLOCK_ID_RE,
      resolve: resolveBlockReferent,
    }),
  ],
} satisfies ServerPluginDefinition;
