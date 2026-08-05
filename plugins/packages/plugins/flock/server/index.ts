import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";

export { flockTry, flockRelease } from "./internal/flock";

export default {
  description:
    "Kernel advisory file locking: flockTry/flockRelease over libc flock(2). The one lock ownership the kernel releases on process death (SIGKILL included) and that consults no pid.",
} satisfies ServerPluginDefinition;
