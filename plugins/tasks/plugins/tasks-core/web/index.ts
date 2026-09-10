import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
// Side-effect registration only: eagerly registers the boot-critical
// tasks / attempts / pushes / conversations-* web descriptors (see ./internal/register).
// tasks-core is the schema/repository layer — it has no UI of its own, but it
// does own how its own resources are READ: the task -> attempts -> runs join
// lives in ./hooks rather than being re-derived by every surface showing it.
import "./internal/register";

export { useTaskAttempts, useTaskConversations } from "./hooks";

export default {
  collapsed: true,
  description:
    "tasks-core web presence: eagerly registers the boot-critical tasks / attempts / pushes / conversations-* resource descriptors so boot-snapshot can hydrate them before first paint, and owns the client-side reads of them (useTaskAttempts / useTaskConversations, the one join from a task to the attempts and runs it produced).",
  contributions: [],
} satisfies PluginDefinition;
