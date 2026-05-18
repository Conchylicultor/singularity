import type { ServerPluginDefinition } from "@server/types";

export { implement, HttpError } from "./internal/implement";

export default {
  id: "endpoints",
  name: "Endpoints",
  description:
    "Typed endpoint contract primitive. defineEndpoint declares the contract; implement() creates the server handler; fetchEndpoint/useEndpoint consume on the client.",
  loadBearing: true,
} satisfies ServerPluginDefinition;
