import { implement } from "@plugins/infra/plugins/endpoints/server";
import { isMain } from "@plugins/infra/plugins/paths/server";
import { readCompositionMarker } from "@plugins/infra/plugins/worktree/server";
import { asNamespace } from "@plugins/infra/plugins/namespace/core";
import { serveStatusEndpoint } from "../../shared/endpoints";

/**
 * Is this namespace actually being served, and could this backend start serving
 * one?
 *
 * The marker is the only honest answer to the first question: `compose-serve`
 * writes `composition.json` into the namespace dir before it composes anything
 * and sweeps it on deactivation, so its presence is what distinguishes a live
 * `http://<id>.localhost:9000` from a config flag nothing has acted on yet.
 * `readCompositionMarker` reads the shared `~/.singularity/worktrees/` tree, so
 * ANY backend can answer it — only *starting* a serve is main-only.
 */
export const handleServeStatus = implement(serveStatusEndpoint, ({ query }) => {
  const marker = readCompositionMarker(asNamespace(query.composition));
  return {
    canServe: isMain(),
    liveness:
      marker === null
        ? ({ served: false } as const)
        : ({
            served: true,
            // Markers written before the field carry no commit. Reported as
            // unknown rather than back-filled from a guess.
            commit: marker.commit ?? null,
            builtAt: marker.builtAt,
          } as const),
  };
});
