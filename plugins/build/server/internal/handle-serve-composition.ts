import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { isMain } from "@plugins/infra/plugins/paths/server";
import { serveCompositionEndpoint } from "../../core/endpoints";
import { triggerBuild } from "./run-build";

export const handleServeComposition = implement(serveCompositionEndpoint, ({ body }) => {
  if (!isMain()) {
    throw new HttpError(
      400,
      "Serve builds run on the main instance only — open singularity.localhost:9000.",
    );
  }
  triggerBuild("manual", { serveComposition: body.composition });
});
