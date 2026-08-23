import boundaryConfig from "../boundary-config";

// The runtime folder names, derived from the single source of truth: the
// `runtimes` isolation-policy map in boundary-config.ts. Each key is a runtime
// whose import permissions the map declares.
// Adding a runtime means editing only that map — no other list to keep in sync.
export const runtimeNames: ReadonlySet<string> = new Set(
  Object.keys(boundaryConfig.runtimes),
);

/**
 * The runtimes whose isolation-policy row admits `shared/` — i.e. the ones a
 * plugin's private `shared/` folder may be imported from.
 *
 * Derived for the same reason {@link runtimeNames} is, and after the same bug:
 * the `shared-wrong-runtime` rule in `plugin-boundaries/check` used to carry its
 * own literal `web | server | central | shared`, which silently stopped agreeing
 * with this map the day `cli` was added to it. The config said the import was
 * legal and the check rejected it, which reads to whoever hits it as their own
 * design being wrong rather than as two lists having drifted.
 *
 * So a new runtime is still one edit to `boundary-config.runtimes`, and whether
 * it may reach `shared/` is answered by the row it writes there.
 */
export const sharedImporters: ReadonlySet<string> = new Set(
  Object.entries(boundaryConfig.runtimes)
    .filter(([, zones]) => zones.includes("shared"))
    .map(([runtime]) => runtime),
);
