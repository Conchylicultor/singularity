import { defineDataDir } from "@plugins/infra/plugins/paths/core";

/**
 * The downloaded IP-to-country snapshot: `<dir>/ip-country.bin`.
 *
 * Machine-wide (or install-wide on a deployed box), not worktree-scoped: one
 * download a week serves every backend. Purely derived from DB-IP's public
 * file, so deleting it costs one re-download, never data.
 */
export const ipCountryCache = defineDataDir({
  kind: "cache",
  name: "ip-country",
  owner: "apps/deploy/analytics/ip-country",
  description:
    "Binary IP-to-country snapshot built from DB-IP IP-to-Country Lite, refreshed weekly",
  reclaim: { kind: "safe" },
});

export default [ipCountryCache];
