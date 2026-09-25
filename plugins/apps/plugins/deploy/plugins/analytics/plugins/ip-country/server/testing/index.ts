// Building a DB-IP snapshot from CSV rows, and a lookup over a snapshot file
// of the suite's own, so a suite can pin which country an address is in.
export { createIpCountryLookup } from "../internal/lookup";
export type { IpCountryLookup } from "../internal/lookup";
export { buildSnapshot } from "../internal/snapshot";
