import type { PluginDefinition } from "@core";

export { formatRelativeTime, RelativeTime } from "./internal/relative-time";

export default {
  id: "relative-time",
  name: "Relative Time",
  description:
    "Formats a Date as a human-readable relative string (just now, Nm ago, Nh ago, Nd ago). Exposes formatRelativeTime() and <RelativeTime date={…} />.",
  contributions: [],
} satisfies PluginDefinition;
