import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";

// The bot-mitigation predicate and the chromium provisioning step live in
// `../core` — import them from there. Re-exporting them here would hide that
// `core` is cheap to import (no Playwright at module eval) while this barrel is
// the one that can start a browser.
export { browserFetch } from "./internal/browser-fetch";
export { BrowserFetchError } from "./internal/errors";
export { browserFetchQueueDepth } from "./internal/pool";
export type {
  BrowserFetchInit,
  BrowserFetchResult,
  BrowserFetchTimings,
  BrowserFetchFailureKind,
} from "./internal/types";

export default {
  description:
    "Browser-backed page read for URLs a plain HTTP client cannot read: launch-per-call headless Chromium pinned to one validated IP via --host-resolver-rules (MAP <host> <ip>,MAP * ~NOTFOUND), every intercepted request re-guarded with parsePublicUrl, cross-origin subresources proxied through safeFetch, bounded by a size-2 host pool. Throws on timeout rather than returning a partially-rendered page.",
} satisfies ServerPluginDefinition;
