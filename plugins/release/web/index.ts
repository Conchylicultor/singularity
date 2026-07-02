import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
// Side-effect registration only: eagerly registers the boot-critical
// release.history / release.previews web descriptors (see ./internal/register).
// The engine has no UI of its own — the Studio release app is the UI consumer.
import "./internal/register";

export default {
  collapsed: true,
  description:
    "Release engine web presence: eagerly registers the boot-critical release.history / release.previews resource descriptors so boot-snapshot can hydrate them before first paint, independent of the (lazy) Studio release UI.",
  contributions: [],
} satisfies PluginDefinition;
