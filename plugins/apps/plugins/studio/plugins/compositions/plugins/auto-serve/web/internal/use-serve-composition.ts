import { useManifestActions } from "@plugins/plugin-meta/plugins/composition/web";
import { useEndpointMutation } from "@plugins/infra/plugins/endpoints/web";
import { serveCompositionEndpoint } from "@plugins/build/core";
import { showToast } from "@plugins/shell/plugins/toast/web";

/**
 * The serve capability for a composition: persist the `autoBuild` intent AND
 * kick an immediate main build so the live URL is ready without waiting for the
 * next full build.
 *
 * `serve` writes MAIN's config via `setAutoBuild(id, true)` (so the compose-serve
 * stage keeps serving it on every subsequent main build) and POSTs the serve
 * endpoint to run the build now. `useEndpointMutation` auto-toasts endpoint
 * errors (e.g. the server's 400 when invoked off-main), so there is no onError.
 *
 * `stop` is flag-only: clearing `autoBuild` stops the composition being served on
 * the next full build; there is nothing to build immediately.
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
      description: "Running a main build; the live URL will be ready shortly.",
      variant: "info",
    });
  };

  const stop = (id: string): void => setAutoBuild(id, false);

  return { serve, stop };
}
