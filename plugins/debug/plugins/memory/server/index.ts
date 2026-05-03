import type { ServerPluginDefinition } from "@server/types";
import { listFiles } from "./internal/list-files";
import { readMemoryFile } from "./internal/read-file";

export default {
  id: "debug-memory",
  name: "Memory",
  description: "Browse Claude Code auto-memory files for the current project.",
  httpRoutes: {
    "GET /api/debug/memory": listFiles,
    "GET /api/debug/memory/:name": readMemoryFile,
  },
} satisfies ServerPluginDefinition;
