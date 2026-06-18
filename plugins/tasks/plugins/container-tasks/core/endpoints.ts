import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

// Lists the ids of every registered system container/meta task. The set is
// static after boot (each owning plugin contributes its id), so the web caches
// it indefinitely and gates Launch affordances on container rows.
export const listContainerTaskIds = defineEndpoint({
  route: "GET /api/tasks/container-ids",
  response: z.object({ ids: z.array(z.string()) }),
});
