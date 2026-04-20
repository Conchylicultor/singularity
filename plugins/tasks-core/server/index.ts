import type { ServerPluginDefinition } from "../../../server/src/types";

// Server-only library plugin. Owns all FK-connected tables (_tasks, _attempts,
// _taskDependencies, pushes, _conversations), derived views, and Zod schemas.
// Phase 1: scaffold only — tables and schemas are live, but the public
// query/mutation API and resource ownership land in Phases 2–3.
export default {
  id: "tasks-core",
  name: "Tasks Core",
  description:
    "Schema + repository layer for the tasks/attempts/conversations FK cluster.",
  resources: [],
} satisfies ServerPluginDefinition;
