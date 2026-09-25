import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export {
  formatRelativeTime,
  RelativeTime,
  type RelativeTimeFormat,
} from "./internal/relative-time";
export { ElapsedTime, formatElapsed, useNow } from "./internal/elapsed-time";

export default {
  description:
    "Formats a Date as a human-readable relative string (just now, Nm ago, Nh ago, Nd ago — or the short now / Nm / Nh / Nd), and a running duration as a clock (m:ss). Exposes formatRelativeTime(), <RelativeTime date={…} />, formatElapsed(), useNow() and <ElapsedTime since={…} />.",
  contributions: [],
} satisfies PluginDefinition;
