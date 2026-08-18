import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { isMain } from "@plugins/infra/plugins/paths/server";
import { isServableCompositionId } from "@plugins/plugin-meta/plugins/composition/core";
import { serveCompositionEndpoint } from "../../core/endpoints";
import { triggerBuild } from "./run-build";

export const handleServeComposition = implement(
  serveCompositionEndpoint,
  ({ body }) => {
    if (!isMain()) {
      throw new HttpError(
        400,
        "Serve builds run on the main instance only — open singularity.localhost:9000.",
      );
    }
    // The loud boundary under the inert toggles. Compose-serve provisions a
    // gateway namespace named after the composition id, and the main app's
    // namespace already belongs to the main checkout's own build — serving a
    // composition into it would have this build overwrite the app running it.
    // The UI renders those toggles disabled; this is what answers a request that
    // reaches the endpoint anyway.
    if (!isServableCompositionId(body.composition)) {
      throw new HttpError(
        400,
        `"${body.composition}" is not a servable composition — its namespace belongs to ` +
          `the main checkout's own build, so compose-serve never provisions it.`,
      );
    }
    triggerBuild("manual", { serveComposition: body.composition });
  },
);
