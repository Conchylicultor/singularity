import { Resource } from "@plugins/framework/plugins/server-core/core";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { runTracked } from "@plugins/infra/plugins/runtime-profiler/core";
import { onPrototypesChanged } from "@plugins/apps/plugins/prototypes/plugins/files/server";
import { PROTOTYPE_THUMB_ROUTE } from "../core";
import { handleThumbnail } from "./internal/handlers";
import { renderThumbnailJob, sweepThumbnailsJob } from "./internal/jobs";
import { prototypeThumbnailsResource } from "./internal/state";
import { syncThumbnails } from "./internal/sync";

export default {
  description:
    "Rendered PNG previews for the prototypes gallery: a content-addressed disk cache, a headless-chromium render job driven by the files watcher, the push state resource the cards read, and the immutable serving route.",
  httpRoutes: {
    [PROTOTYPE_THUMB_ROUTE]: handleThumbnail,
  },
  contributions: [Resource.Declare(prototypeThumbnailsResource)],
  register: [renderThumbnailJob, sweepThumbnailsJob],
  onReady: () => {
    // `files` owns `prototypes/` and already watches it; subscribing to the
    // signal it computes is what keeps a second watcher off the same tree.
    onPrototypesChanged(() => {
      void runTracked("prototype-thumbnails:sync", () => syncThumbnails());
    });

    // Reconcile once at boot: the cache is host-global and survives restarts,
    // so this is usually a few stats that confirm everything is already there.
    // Fire-and-forget — a failure surfaces as an unhandled rejection (reports
    // files it) rather than being swallowed into an invisible boot no-op.
    void runTracked("prototype-thumbnails:sync", () => syncThumbnails());
  },
} satisfies ServerPluginDefinition;
