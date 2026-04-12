import type { ServerPluginDefinition } from "../../../server/src/types";
import { handleRead, handleWrite } from "./internal/handlers";

const plugin: ServerPluginDefinition = {
  id: "db-smoketest",
  name: "DB Smoketest",
  httpRoutes: {
    "POST /api/smoketest": handleWrite,
    "GET /api/smoketest": handleRead,
  },
};
export default plugin;
