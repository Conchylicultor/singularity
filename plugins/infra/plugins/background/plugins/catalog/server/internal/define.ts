import type { Registration } from "@plugins/framework/plugins/server-core/core";
import type { BackgroundKindSpec } from "../../shared/providers";
import {
  makeBackgroundKind,
  type BackgroundKind as Kind,
} from "../../shared/kind";
import { backgroundCatalogServed, backgroundRecentRunsServed } from "./live";

/** A registered provider: mount it in `register: [...]`, and call `changed`
 * when what it reports may have moved. */
export type BackgroundKind = Kind & Registration;

/**
 * Declare a background provider: a mechanism that runs things on its own
 * (jobs, warm-ups, timers) reports them here, and the catalog lists them.
 *
 * ```ts
 * export const jobsBackgroundKind = defineBackgroundKind({
 *   kind: "job", label: "Jobs",
 *   list: listJobEntries, recentRuns: jobRecentRuns, runNow: runJobNow,
 * });
 * // register: [jobsBackgroundKind]
 * ```
 */
export function defineBackgroundKind(spec: BackgroundKindSpec): BackgroundKind {
  return makeBackgroundKind(spec, {
    catalog: () => backgroundCatalogServed.notify(),
    recentRuns: (params) => backgroundRecentRunsServed.notify(params),
  });
}
