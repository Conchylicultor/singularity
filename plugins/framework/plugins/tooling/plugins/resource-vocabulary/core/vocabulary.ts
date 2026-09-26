import type { ResourceDescriptor } from "@plugins/primitives/plugins/live-state/core";
// Type-only NAMESPACE imports: the derivation below needs each barrel's whole
// module type, and an inline `typeof import("…")` would bypass the boundary
// system (it is not an import statement the checker can see). `import type * as`
// is a real, checkable edge that still erases completely.
import type * as LiveStateBarrel from "@plugins/primitives/plugins/live-state/core";
import type * as QueryResourceBarrel from "@plugins/infra/plugins/query-resource/core";
import type * as LiveBarrel from "@plugins/network/plugins/live/core";

// The closed set of ways a plugin declares a live-state resource, as DATA, so
// every build-time scanner that has to recognise one reads the same list.
//
// Two scanners used to keep private copies of this list, and they disagreed:
// the `resources` docgen facet knew three descriptor factories, the eager-tier
// generator knew four (a different four). Neither knew the five bounded-membership
// factories the working-set contract added, so ~10 plugins served a resource the
// docs said they didn't, and a preloaded bounded descriptor under
// `apps/plugins/**` would silently fail to pin its plugin eager. An unrecognised
// factory produced no match and therefore no data — indistinguishable from a
// plugin that genuinely declares nothing, which is why nothing noticed.
//
// So the list is not authored free-hand. Its KEY SET is derived from the
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
export const LIVE_CORE = "@plugins/network/plugins/live/core";
export const LIVE_SERVER = "@plugins/network/plugins/live/server";

/**
 * The bounded working-set membership a factory attaches to its descriptor, or
 * `null` for a global/unbounded one. See
 * `research/2026-07-18-global-bounded-working-set-resource-contract.md`.
 */
export type ResourceMembership = "window" | "point";

/** One runtime resource a factory call mints. */
export interface MintedResource {
  /**
   * Appended to the call's literal key to form this resource's key — `""` for
   * the key itself. `liveCollection("events.sources", …)` mints
   * `events.sources` (suffix `""`), `events.sources:rows` (suffix `":rows"`)
   * and `events.sources:groups` (suffix `":groups"`).
   */
  suffix: string;
  /** Row-keyed delta-sync (server `mode: "keyed"`) rather than whole-value push. */
  keyed: boolean;
  /** Bounded membership the resource carries, `null` when it declares none. */
  membership: ResourceMembership | null;
  /**
   * Whether the call's preload flag reaches THIS resource. A collection's
   * preload hydrates its default window only — its point and groups siblings
   * have no default tuple the server could load before a tab names one — so a
   * scanner marking every mint boot-critical would pin resources nothing
   * preloads.
   */
  preloadable: boolean;
  /**
   * Minted only when the call's spec sets this field — absent means always.
   * A `liveCollection` declared without `default` is lookup-only: it mints
   * `k:rows` alone, so its window and groups carry `requires: "default"`. A
   * scanner reads the field's PRESENCE from source text, like `preload:`.
   */
  requires?: string;
}

/**
 * How a factory call spells "hydrate before first paint", as the scanners read
 * it from source text: ONE spelling for every factory — a `preload:` field
 * (in the old factories' trailing options object, or a declaration's spec),
 * whose literal value is one of `preloads` (hydrated at boot — `"boot-and-keep"`
 * only adds a client-side resident cache) or `none` (not preloaded). Any other
 * literal, or a non-literal, makes the scanner throw.
 */
export interface PreloadFlag {
  field: "preload";
  preloads: readonly string[];
  none: readonly string[];
}

export interface DescriptorFactory {
  /** Barrel the factory is exported from — quoted in scanner error messages. */
  barrel: string;
  /** The field a call sets to preload what it mints (see {@link PreloadFlag}). */
  preload: PreloadFlag;
  /**
   * Every resource one call mints, in declaration order. One entry (suffix
   * `""`) for a plain descriptor factory; a collection factory mints several
   * from one literal key, and a scanner that read only the first would hide
   * the rest from the docs and the eager tier.
   */
  mints: readonly MintedResource[];
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
 * the exact failure mode this file exists to end. Widening the fields
 * instead keeps the filter total. It matches on `key` + `schema` only — not
 * `initialData`, which a `liveValue` (no placeholder) does not have, so it
 * would slip past the filter.
 *
 * Over-inclusion is the safe direction: a future non-factory export that happens
 * to match demands a classification entry, which is a loud compile error.
 * Under-inclusion is the dangerous one, and no real descriptor can miss
 * either field.
 */
interface MintedDescriptor {
  key: string;
  schema: unknown;
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

/**
 * A collection declaration: one call minting a `:rows` point descriptor and —
 * unless it is lookup-only — a window and a `:groups` sibling
 * (`liveCollection`). Matched on `rows`, the one descriptor every form mints,
 * structurally for the same reason as {@link MintedDescriptor}.
 */
interface MintedCollection {
  rows: MintedDescriptor;
}

/** Every export of `M` that is a function returning a collection declaration. */
type CollectionFactoryNames<M> = {
  [K in keyof M]-?: M[K] extends (...args: never[]) => infer R
    ? [R] extends [MintedCollection]
      ? K
      : never
    : never;
}[keyof M];

type MintingFactoryName =
  | DescriptorFactoryNames<typeof LiveStateBarrel>
  | DescriptorFactoryNames<typeof QueryResourceBarrel>
  | DescriptorFactoryNames<typeof LiveBarrel>
  | CollectionFactoryNames<typeof LiveBarrel>;

// ── The vocabulary ─────────────────────────────────────────────────

/**
 * Every descriptor factory, and what the descriptor it mints is.
 *
 * `satisfies Record<MintingFactoryName, …>` is load-bearing in BOTH directions:
 * a factory exported from either barrel and missing here fails to compile with
 * the missing key named, and an entry for a factory that no longer exists fails
 * as an excess property.
 */
const PRELOAD: PreloadFlag = {
  field: "preload",
  preloads: ["boot", "boot-and-keep"],
  none: ["none"],
};

export const resourceDescriptorFactories = {
  resourceDescriptor: {
    barrel: LIVE_STATE_CORE,
    preload: PRELOAD,
    mints: [{ suffix: "", keyed: false, membership: null, preloadable: true }],
  },
  keyedResourceDescriptor: {
    barrel: LIVE_STATE_CORE,
    preload: PRELOAD,
    mints: [{ suffix: "", keyed: true, membership: null, preloadable: true }],
  },
  queryResourceDescriptor: {
    barrel: QUERY_RESOURCE_CORE,
    preload: PRELOAD,
    mints: [{ suffix: "", keyed: true, membership: null, preloadable: true }],
  },
  windowQueryResourceDescriptor: {
    barrel: QUERY_RESOURCE_CORE,
    preload: PRELOAD,
    mints: [
      { suffix: "", keyed: true, membership: "window", preloadable: true },
    ],
  },
  pointQueryResourceDescriptor: {
    barrel: QUERY_RESOURCE_CORE,
    preload: PRELOAD,
    mints: [
      { suffix: "", keyed: true, membership: "point", preloadable: true },
    ],
  },
  liveValue: {
    barrel: LIVE_CORE,
    preload: PRELOAD,
    mints: [{ suffix: "", keyed: false, membership: null, preloadable: true }],
  },
  liveCollection: {
    barrel: LIVE_CORE,
    preload: PRELOAD,
    mints: [
      {
        suffix: "",
        keyed: true,
        membership: "window",
        preloadable: true,
        requires: "default",
      },
      { suffix: ":rows", keyed: true, membership: "point", preloadable: false },
      {
        suffix: ":groups",
        keyed: false,
        membership: null,
        preloadable: false,
        requires: "default",
      },
    ],
  },
} satisfies Record<MintingFactoryName, DescriptorFactory>;

export type DescriptorFactoryName = keyof typeof resourceDescriptorFactories;

/**
 * Every call that SERVES a descriptor on a runtime. `defineResource` /
 * `defineExternalResource` are the resource runtime's own two primitives,
 * re-presented identically by `server-core/core` and `central-core/core`;
 * `queryResource` / `windowQueryResource` are the query compiler's wrappers
 * around the first, `serveCollection` serves every resource a
 * `liveCollection` mints (its first argument resolves to every minted key),
 * and `serveValue` serves a `liveValue`.
 *
 * `serveValue` is ALSO exported by `network/live/central` — the central
 * runtime's twin (a value declared `origin: "central"`, external arm only),
 * built on the same option compilation. One name, one entry: a scanner matches
 * the call by name, and which runtime serves it is the folder the call sits in
 * (`server/` vs `central/`). The entry's `barrel` names the worktree barrel, and
 * the `check/` completeness derivation covers it (a `check/` may not import a
 * `central` barrel, so a new central-only marker must be added here by hand).
 *
 * Completeness is asserted in this plugin's `check/` — see the header note.
 */
export const resourceRegisterMarkers = {
  defineResource: { barrel: SERVER_CORE },
  defineExternalResource: { barrel: SERVER_CORE },
  queryResource: { barrel: QUERY_RESOURCE_SERVER },
  windowQueryResource: { barrel: QUERY_RESOURCE_SERVER },
  serveCollection: { barrel: LIVE_SERVER },
  serveValue: { barrel: LIVE_SERVER },
} satisfies Record<string, RegisterMarker>;

export type RegisterMarkerName = keyof typeof resourceRegisterMarkers;

/**
 * Repo-relative directories of the plugins that OWN the vocabulary — derived
 * from the entries' barrels, so it cannot drift from them.
 *
 * A scanner needs this to tell a DECLARATION from an IMPLEMENTATION. Inside
 * `live-state`, `query-resource` and `network/live`, a factory is called with a computed key
 * (`keyedResourceDescriptor(key, …)` inside `windowQueryResourceDescriptor`) —
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
