import type { ServerPluginDefinition } from "@server/types";
import { handleBootProfiling } from "./internal/handle-boot-profiling";

export default {
  id: "debug-profiling-boot",
  name: "Boot Profiling",
  description: "Server boot profiling data endpoint.",
  httpRoutes: {
    "GET /api/debug/profiling/boot": handleBootProfiling,
  },
} satisfies ServerPluginDefinition;
