import type { ServerPluginDefinition } from "@server/types";
import { listFiles } from "./internal/list-files";
import { readMemoryFile } from "./internal/read-file";
import { listMemoryFiles, readMemoryFile as readMemoryFileEndpoint } from "../shared/endpoints";

export default {
  id: "debug-memory",
  name: "Memory",
  description: "Browse Claude Code auto-memory files for the current project.",
  httpRoutes: {
    [listMemoryFiles.route]: listFiles,
    [readMemoryFileEndpoint.route]: readMemoryFile,
  },
} satisfies ServerPluginDefinition;
