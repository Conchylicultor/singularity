import type { Registration } from "@plugins/framework/plugins/central-core/core";
import type { BackgroundKindSpec } from "../../shared/providers";
import {
  makeBackgroundKind,
  type BackgroundKind as Kind,
} from "../../shared/kind";
import {
  backgroundCentralCatalogServed,
  backgroundCentralRecentRunsServed,
} from "./live";

/** A registered central provider: mount it in the central plugin's
 * `register: [...]`. */
export type BackgroundKind = Kind & Registration;

/**
 * Declare a background provider on the central runtime. The same contract as
 * the server's `defineBackgroundKind`; its entries land in
 * `background.central-catalog`, and every one must be `scope: "central"`.
 * Run now is not served for central entries.
 */
export function defineBackgroundKind(
  spec: Omit<BackgroundKindSpec, "runNow">,
): BackgroundKind {
  return makeBackgroundKind(spec, {
    catalog: () => backgroundCentralCatalogServed.notify(),
    recentRuns: (params) => backgroundCentralRecentRunsServed.notify(params),
  });
}
