import type { ServerPluginDefinition } from "@server/types";
import { handleCreate } from "./internal/handle-create";
import { handleGet } from "./internal/handle-get";
import { handleSaveFile } from "./internal/handle-save-file";

export default {
  id: "screenshot",
  name: "Screenshot",
  description: "Stores in-flight screenshots so a freshly opened tab can fetch them.",
  httpRoutes: {
    "POST /api/screenshots/:id": handleCreate,
    "GET /api/screenshots/:id": handleGet,
    "POST /api/screenshots/:id/file": handleSaveFile,
  },
} satisfies ServerPluginDefinition;
