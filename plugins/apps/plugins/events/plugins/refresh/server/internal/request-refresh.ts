import type { Registration } from "@plugins/framework/plugins/server-core/core";
import type { RefreshSourceResult } from "@plugins/apps/plugins/events/plugins/events-core/core";
import {
  registerRefreshRunner,
  requireSource,
} from "@plugins/apps/plugins/events/plugins/events-core/server";
import { refreshSourceJob } from "./jobs";

// The engine's half of the "Refresh now" seam. `events-core` owns the endpoint
// and cannot import this plugin (that would be a cycle), so it exposes
// `registerRefreshRunner` and the engine installs the handler below.

/**
 * Ask for one source to be refreshed now.
 *
 * The result is a discriminated union rather than a boolean because "no run
 * started" has genuinely different meanings the UI must tell apart. An unknown
 * id is NOT in it: `requireSource` throws a 404, which is an error, not an
 * outcome.
 *
 * The enqueue happens even when the row already says `running`, and the status
 * is reported as a hint. That ordering is deliberate: `running` is a row flag,
 * and a backend killed mid-run leaves it set forever, so treating it as a
 * gate would make a wedged source permanently unrefreshable. Enqueuing instead
 * self-heals — the job's `sourceId` dedup coalesces a genuinely-live run, and a
 * stale flag is simply overwritten by the next run.
 */
export async function requestRefresh(
  sourceId: string,
): Promise<RefreshSourceResult> {
  const source = await requireSource(sourceId);
  if (!source.enabled) {
    return {
      status: "skipped",
      reason: "disabled",
      message: `"${source.name}" is disabled. Enable it to refresh.`,
    };
  }

  await refreshSourceJob.enqueue({ sourceId });
  return source.status === "running"
    ? { status: "already-running" }
    : { status: "enqueued" };
}

/**
 * Installs the runner during the register phase — before any request can be
 * served, so the endpoint's "no engine installed" 503 can only ever mean a
 * composition that genuinely omits this plugin.
 */
export const refreshRunnerRegistration: Registration = {
  register() {
    registerRefreshRunner(requestRefresh);
  },
};
