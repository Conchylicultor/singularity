import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { detectUpstreamUpdatesJob } from "./internal/detect-job";
import { upstreamUpdatesKind } from "./internal/report-kind";

export {
  upstreamUpdatesKind,
  UPSTREAM_UPDATES_KIND,
} from "./internal/report-kind";
export type { UpstreamUpdatesPayload } from "./internal/report-kind";

export default {
  description:
    "Daily upstream.detect-updates job (main only): when the repo this checkout was cloned from has commits local `main` does not, it records one rolling `upstream-updates-available` report — the bell and Debug → Reports. It files no task and merges nothing; the user presses Investigate, and the task minted then carries the `./singularity upstream merge` instructions.",
  contributions: [upstreamUpdatesKind],
  register: [detectUpstreamUpdatesJob],
} satisfies ServerPluginDefinition;
