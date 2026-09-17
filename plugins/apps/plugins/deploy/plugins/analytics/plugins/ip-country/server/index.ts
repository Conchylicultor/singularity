import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { enqueueRefreshIfNeeded } from "./internal/boot";
import { ipCountryRefreshJob } from "./internal/refresh";

export {
  createIpCountryLookup,
  lookupCountry,
  reloadIpCountry,
} from "./internal/lookup";
export type { IpCountryLookup, IpCountryResult } from "./internal/lookup";
export { buildSnapshot } from "./internal/snapshot";
export { ipCountryRefreshJob } from "./internal/refresh";

export default {
  description:
    "IP-to-country lookup from a local copy of DB-IP IP-to-Country Lite: lookupCountry(ip) answers found / unlisted / unavailable by binary search over an in-memory snapshot read lazily from the machine-wide cache, and the weekly ip-country.refresh job (also enqueued at boot when the snapshot is missing or stale) downloads the CSV, builds the compact binary snapshot and swaps it in. The IP never leaves the process.",
  register: [ipCountryRefreshJob],
  onReady: enqueueRefreshIfNeeded,
} satisfies ServerPluginDefinition;
