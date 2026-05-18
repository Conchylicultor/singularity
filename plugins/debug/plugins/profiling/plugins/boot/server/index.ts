import type { ServerPluginDefinition } from "@server/types";
import { handleBootProfiling } from "./internal/handle-boot-profiling";
import { getBootProfiling } from "../shared/endpoints";

export default {
  id: "debug-profiling-boot",
  name: "Boot Profiling",
  description: "Server boot profiling data endpoint.",
  httpRoutes: {
    [getBootProfiling.route]: handleBootProfiling,
  },
} satisfies ServerPluginDefinition;
