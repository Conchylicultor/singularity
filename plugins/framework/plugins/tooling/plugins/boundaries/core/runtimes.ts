import boundaryConfig from "../boundary-config";

// The runtime folder names, derived from the single source of truth: the
// `runtimes` isolation-policy map in boundary-config.ts. Each key is a runtime
// (web/server/central/core/shared) whose import permissions the map declares.
// Adding a runtime means editing only that map — no other list to keep in sync.
export const runtimeNames: ReadonlySet<string> = new Set(
  Object.keys(boundaryConfig.runtimes),
);
