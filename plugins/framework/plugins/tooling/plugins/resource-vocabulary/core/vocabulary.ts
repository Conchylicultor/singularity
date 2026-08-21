import type { ResourceDescriptor } from "@plugins/primitives/plugins/live-state/core";
// Type-only NAMESPACE imports: the derivation below needs each barrel's whole
// module type, and an inline `typeof import("…")` would bypass the boundary
// system (it is not an import statement the checker can see). `import type * as`
// is a real, checkable edge that still erases completely.
import type * as LiveStateBarrel from "@plugins/primitives/plugins/live-state/core";
import type * as QueryResourceBarrel from "@plugins/infra/plugins/query-resource/core";

// The closed set of ways a plugin declares a live-state resource, as DATA, so
// every build-time scanner that has to recognise one reads the same list.
//
// Two scanners used to keep private copies of this list, and they disagreed:
// the `resources` docgen facet knew three descriptor factories, the eager-tier
// generator knew four (a different four). Neither knew the five bounded-membership
// factories the working-set contract added, so ~10 plugins served a resource the
// docs said they didn't, and a `bootCritical: true` bounded descriptor under
// `apps/plugins/**` would silently fail to pin its plugin eager. An unrecognised
// factory produced no match and therefore no data — indistinguishable from a
// plugin that genuinely declares nothing, which is why nothing noticed.
//
// So the list is not authored free-hand. Its KEY SET is derived from the two
// barrels' own module types, filtered by return type: a factory exported from
// either barrel and missing here is a `tsc` error at the `satisfies` below,
// naming the missing key. Nothing about the NAME is inspected — membership in
// the set is decided by what the function returns.
//
// The register markers (the server-side calls that SERVE a descriptor) cannot be
// derived here: `query-resource/server` is a `server` barrel and runtime
// isolation grants `core -> core` only. Their completeness assertion lives in
// this plugin's `check/`, which has no runtime restriction.
//
// Between the two, there is no silent path left: a factory added to a KNOWN
// barrel is a compile error until it is classified, and a resource declared any
// other way (a third plugin's own factory) makes the register-call scanner throw
// at the call site, because it cannot resolve the descriptor identifier.

/**
 * Barrel specifiers the vocabulary is derived from. Read in two places: quoted
 * in a scanner's error message ("add it to …"), and turned into the owner-plugin
 * paths below.
 *
 * `defineResource` / `defineExternalResource` are re-presented identically by
 * `central-core/core`; the entry names `server-core` because a specifier is one
 * string and the two are the same runtime object behind two facades.
 */
export const LIVE_STATE_CORE = "@plugins/primitives/plugins/live-state/core";
export const QUERY_RESOURCE_CORE = "@plugins/infra/plugins/query-resource/core";
export const SERVER_CORE = "@plugins/framework/plugins/server-core/core";
export const QUERY_RESOURCE_SERVER =
  "@plugins/infra/plugins/query-resource/server";

/**
 * The bounded working-set membership a factory attaches to its descriptor, or
 * `null` for a global/unbounded one. See
 * `research/2026-07-18-global-bounded-working-set-resource-contract.md`.
 */
export type ResourceMembership = "window" | "point";

export interface DescriptorFactory {
  /** Barrel the factory is exported from — quoted in scanner error messages. */
  barrel: string;
  /** Row-keyed delta-sync (server `mode: "keyed"`) rather than whole-value push. */
  keyed: boolean;
  /** Bounded membership the factory attaches, `null` when it declares none. */
  membership: ResourceMembership | null;
}

export interface RegisterMarker {
  /** Barrel the register call is imported from — quoted in error messages. */
  barrel: string;
}

// ── Derivation ─────────────────────────────────────────────────────

/**
 * The minimal structural shape EVERY resource descriptor has, whatever factory
 * minted it — `ResourceDescriptor<T, P>` and each of its extensions
 * (`WindowResourceDescriptor`, `PointResourceDescriptor`,
 * `{Window,Point}QueryResourceContract`) satisfy it.
 *
 * Deliberately NOT `ResourceDescriptor<unknown, …>`: `schema` is a
 * `ZodParser<T>`, which is invariant in `T` (zod surfaces `T` in both parameter
 * and return positions), so a `ResourceDescriptor<Row[]>` is not assignable to
 * `ResourceDescriptor<unknown>` and the filter would silently match nothing —
 * the exact failure mode this file exists to end. Widening the three fields
 * instead keeps the filter total.
 *
 * Over-inclusion is the safe direction: a future non-factory export that happens
 * to match demands a classification entry, which is a loud compile error.
 * Under-inclusion is the dangerous one, and no real descriptor can miss all
 * three fields.
 */
interface MintedDescriptor {
  key: string;
  schema: unknown;
  initialData: unknown;
}

/** Every export of `M` that is a function returning a resource descriptor. */
type DescriptorFactoryNames<M> = {
  [K in keyof M]-?: M[K] extends (...args: never[]) => infer R
    ? // Non-distributive, so a `Descriptor | undefined` return (the `byKey`
      // lookup `resourceDescriptorByKey`) is correctly excluded rather than
      // matching on its defined arm.
      [R] extends [MintedDescriptor]
      ? K
      : never
    : never;
}[keyof M];

type MintingFactoryName =
  | DescriptorFactoryNames<typeof LiveStateBarrel>
  | DescriptorFactoryNames<typeof QueryResourceBarrel>;

// ── The vocabulary ─────────────────────────────────────────────────

/**
 * Every descriptor factory, and what the descriptor it mints is.
 *
 * `satisfies Record<MintingFactoryName, …>` is load-bearing in BOTH directions:
 * a factory exported from either barrel and missing here fails to compile with
 * the missing key named, and an entry for a factory that no longer exists fails
 * as an excess property.
 */
export const resourceDescriptorFactories = {
  resourceDescriptor: {
    barrel: LIVE_STATE_CORE,
    keyed: false,
    membership: null,
  },
  keyedResourceDescriptor: {
    barrel: LIVE_STATE_CORE,
    keyed: true,
    membership: null,
  },
  centralResourceDescriptor: {
    barrel: LIVE_STATE_CORE,
    keyed: false,
    membership: null,
  },
  windowResourceDescriptor: {
    barrel: LIVE_STATE_CORE,
    keyed: true,
    membership: "window",
  },
  pointResourceDescriptor: {
    barrel: LIVE_STATE_CORE,
    keyed: true,
    membership: "point",
  },
  queryResourceDescriptor: {
    barrel: QUERY_RESOURCE_CORE,
    keyed: true,
    membership: null,
  },
  windowQueryResourceDescriptor: {
    barrel: QUERY_RESOURCE_CORE,
    keyed: true,
    membership: "window",
  },
  pointQueryResourceDescriptor: {
    barrel: QUERY_RESOURCE_CORE,
    keyed: true,
    membership: "point",
  },
} satisfies Record<MintingFactoryName, DescriptorFactory>;

export type DescriptorFactoryName = keyof typeof resourceDescriptorFactories;

/**
 * Every call that SERVES a descriptor on a runtime. `defineResource` /
 * `defineExternalResource` are the resource runtime's own two primitives,
 * re-presented identically by `server-core/core` and `central-core/core`;
 * `queryResource` / `windowQueryResource` are the query compiler's wrappers
 * around the first.
 *
 * Completeness is asserted in this plugin's `check/` — see the header note.
 */
export const resourceRegisterMarkers = {
  defineResource: { barrel: SERVER_CORE },
  defineExternalResource: { barrel: SERVER_CORE },
  queryResource: { barrel: QUERY_RESOURCE_SERVER },
  windowQueryResource: { barrel: QUERY_RESOURCE_SERVER },
} satisfies Record<string, RegisterMarker>;

export type RegisterMarkerName = keyof typeof resourceRegisterMarkers;

/**
 * Repo-relative directories of the plugins that OWN the vocabulary — derived
 * from the entries' barrels, so it cannot drift from them.
 *
 * A scanner needs this to tell a DECLARATION from an IMPLEMENTATION. Inside
 * `live-state` and `query-resource`, a factory is called with a computed key
 * (`windowResourceDescriptor(key, …)` inside `windowQueryResourceDescriptor`) —
 * that is the wrapper implementing the factory, not a plugin declaring a
 * resource. Everywhere else the key must be a literal at the call site, because
 * a scanner reading source text has no other way to see it.
 */
export const resourceVocabularyOwnerPaths: readonly string[] = [
  ...new Set(
    [
      ...Object.values(resourceDescriptorFactories),
      ...Object.values(resourceRegisterMarkers),
    ].map((e) =>
      // "@plugins/infra/plugins/query-resource/server" → "plugins/infra/plugins/query-resource"
      e.barrel.replace(/^@plugins\//, "plugins/").replace(/\/[^/]+$/, ""),
    ),
  ),
];

/**
 * True when `pluginDir` (an absolute or repo-relative plugin directory) is one of
 * {@link resourceVocabularyOwnerPaths}. Separator-agnostic, so a caller passes
 * the path it already has.
 */
export function isResourceVocabularyOwner(pluginDir: string): boolean {
  const normalized = pluginDir.split("\\").join("/");
  return resourceVocabularyOwnerPaths.some(
    (p) => normalized === p || normalized.endsWith("/" + p),
  );
}

type Assert<T extends true> = T;

/**
 * `MintedDescriptor` must stay a WIDENING of the real descriptor — if it ever
 * stops being one (a field renamed in `live-state/core`), the filter above would
 * quietly match nothing and every scanner would go blind again, which is exactly
 * the failure this file exists to end. This assertion turns that into a compile
 * error here instead. Exported so it is a public part of the contract rather
 * than an unused local.
 */
export type DescriptorShapeIsWidening = Assert<
  ResourceDescriptor<unknown> extends MintedDescriptor ? true : false
>;
