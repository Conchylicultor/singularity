import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { useRailGuard } from "./internal/use-rail-guard";

export default {
  description:
    "Web half of the rail contract: useRailGuard, the dev-only structural guard a region owner attaches to its own box. It measures every child's content edge against the rail the region published and names whoever applied an inset on top of it — the double-inset that looks reasonable at every call site and is only visible as content indented twice.",
  contributions: [],
} satisfies PluginDefinition;
