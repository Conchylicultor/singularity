import { implement } from "@plugins/infra/plugins/endpoints/server";
import { REPO_ROOT, checkoutRef } from "@plugins/infra/plugins/paths/server";
import { readCompositionMarker } from "@plugins/infra/plugins/worktree/server";
import {
  namespaceFor,
  namespaceUrl,
} from "@plugins/infra/plugins/namespace/core";
import { serveStatusEndpoint } from "../../shared/endpoints";

/**
 * WHERE is this composition served from here, and is anything actually there?
 *
 * The namespace is resolved rather than received. `REPO_ROOT` is the checkout
 * this backend runs out of — main's for the main app, the building worktree's
 * for a composition served from one — so `namespaceFor(composition, checkoutRef)`
 * is the namespace a serve build started HERE would publish, and the one a
 * marker for it would live under. The browser cannot compose it: it knows the
 * namespace it is talking to, and a namespace does not decompose back into its
 * (composition, checkout) pair.
 *
 * The marker is the only honest answer to the second question: a serve build
 * writes `composition.json` into the namespace dir before it composes anything,
 * so its presence is what distinguishes a live URL from a config flag nothing
 * has acted on yet. `readCompositionMarker` reads the shared
 * `~/.singularity/worktrees/` tree, so a backend can answer for a namespace it
 * does not itself serve.
 *
 * There is no `canServe` any more. It answered "is this backend main?", because
 * the serve stage ran inside main's build; a serve is now an ordinary build of
 * this checkout, startable anywhere. Whether a composition may be served AT ALL
 * (main's may not — its namespace is the checkout's own app) is
 * `isServableCompositionId`, a pure function of the id that every surface can
 * call directly.
 */
export const handleServeStatus = implement(
  serveStatusEndpoint,
  async ({ query }) => {
    const ns = namespaceFor(query.composition, await checkoutRef(REPO_ROOT));
    const marker = readCompositionMarker(ns);
    return {
      namespace: ns,
      url: namespaceUrl(ns),
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
  },
);
