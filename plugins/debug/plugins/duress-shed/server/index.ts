import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { duressShedKind } from "./internal/duress-shed-kind";

export default {
  description:
    "The duress-shed report kind: validates each shed buffer's post-episode flush summary, fingerprints per (buffer, episode) so summaries never dedupe across episodes or buffers, and renders the accounting task. Declares itself duressExempt so the accounting can never itself be shed.",
  contributions: [duressShedKind],
} satisfies ServerPluginDefinition;
