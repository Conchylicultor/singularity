import type { ServerPluginDefinition } from "../../../server/src/types";
import { handleCreate } from "./internal/handle-create";
import { handleGet } from "./internal/handle-get";

const plugin: ServerPluginDefinition = {
  id: "screenshot",
  name: "Screenshot",
  description: "Stores in-flight screenshots so a freshly opened tab can fetch them.",
  httpRoutes: {
    "POST /api/screenshots/:id": handleCreate,
    "GET /api/screenshots/:id": handleGet,
  },
};
export default plugin;
