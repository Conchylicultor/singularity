import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
// Side-effect registration only: eagerly registers the boot-critical
// tasks / attempts / pushes / conversations-* web descriptors (see ./internal/register).
// tasks-core is the schema/repository layer — it has no UI of its own.
import "./internal/register";

export default {
  collapsed: true,
  description:
    "tasks-core web presence: eagerly registers the boot-critical tasks / attempts / pushes / conversations-* resource descriptors so boot-snapshot can hydrate them before first paint, independent of any (lazy) consumer UI.",
  contributions: [],
} satisfies PluginDefinition;
