import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export {
  isEmbeddedDocument,
  embedUrl,
  resetEmbedForTests,
} from "./internal/embed-document";

export default {
  description:
    "The declared chromeless-document signal: isEmbeddedDocument() reads the `?embed=1` flag once at boot (the pane router drops every query on its first write, so it cannot be re-read), and embedUrl(path) builds an in-app URL that opens that way. Read by the apps layout (no tab bar, no rail), the floating action bar (hidden), and the two sessionStorage writers (app-instance registry, persisted tabs) so a same-origin frame never evicts the host tab's own state.",
  contributions: [],
} satisfies PluginDefinition;
