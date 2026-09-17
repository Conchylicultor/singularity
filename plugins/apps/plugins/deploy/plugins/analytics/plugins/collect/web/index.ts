import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { AnalyticsTracker } from "./components/analytics-tracker";
export { track } from "./internal/instance";

export default {
  description:
    "The cookieless visit tracker a deployed site mounts: <AnalyticsTracker app={…} /> records one pageview per path change under that app (landing referrer and utm tags on the first only) and the visible time on each; track(name, props?) records a custom event on the current page.",
  contributions: [],
} satisfies PluginDefinition;
