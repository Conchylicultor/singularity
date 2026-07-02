import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { DeferredRouteFallback } from "./components/deferred-route-fallback";

export default {
  description:
    "Loading placeholder for an unmatched pane route while the deferred plugin tier is still loading; renders null once loading settles so a genuinely-invalid URL falls through to not-found.",
  contributions: [],
} satisfies PluginDefinition;
