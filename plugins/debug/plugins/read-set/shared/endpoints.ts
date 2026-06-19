import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";
import { resourcesReadSetSchema } from "./schema";

// The `/api/resources/_debug` route is handled INSIDE the shared resource
// runtime (`handleResourcesDebug` in
// @plugins/framework/plugins/resource-runtime/core) — that handler stays the
// single authoritative source. This endpoint only declares the contract so the
// read-set pane can `useEndpoint` it with a parsed, typed response; the server
// ignores the response schema, so it is client-safe.

export const resourcesReadSetEndpoint = defineEndpoint({
  route: "GET /api/resources/_debug",
  response: resourcesReadSetSchema,
});
