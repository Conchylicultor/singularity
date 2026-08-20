import { useManifestActions } from "@plugins/plugin-meta/plugins/composition/web";
import { useEndpointMutation } from "@plugins/infra/plugins/endpoints/web";
import { serveCompositionEndpoint } from "@plugins/build/core";
import { showToast } from "@plugins/shell/plugins/toast/web";

/**
 * The serve capability for a composition: persist the `autoBuild` intent AND run
 * the build that makes it true.
 *
 * `serve` writes the intent via `setAutoBuild(id, true)` and POSTs the serve
 * endpoint, which runs `./singularity build --composition <id>` in the checkout
 * this backend belongs to — so the live URL is
 * `<id>.<checkout>.localhost:9000` and it is ready when that build ends.
 * `useEndpointMutation` auto-toasts endpoint errors (e.g. the server's 400 for a
 * composition that can never be served), so there is no onError.
 *
 * `stop` is flag-only, and since auto-serve was deleted the flag stops NOTHING:
 * clearing it records that the composition is no longer meant to be live, but the
 * namespace keeps serving its last dist until something reclaims it. Reclaiming
 * is Phase 5 of
 * research/2026-08-17-global-composition-build-serve-model.md; the panel says so
 * rather than implying a stop that does not happen.
 */
export function useServeComposition(): {
  serve: (id: string) => void;
  stop: (id: string) => void;
} {
  const { setAutoBuild } = useManifestActions();
  const build = useEndpointMutation(serveCompositionEndpoint);

  const serve = (id: string): void => {
    setAutoBuild(id, true);
    build.mutate({ body: { composition: id } });
    showToast({
      title: `Building & serving “${id}”…`,
      description:
        "Running a build of this checkout; the live URL will be ready shortly.",
      variant: "info",
    });
  };

  const stop = (id: string): void => setAutoBuild(id, false);

  return { serve, stop };
}
