import type { ResourceDescriptor } from "./resource";

// Bounded-membership selector encodings — the wire params for the two bounded
// resource kinds of the bounded working-set contract
// (research/2026-07-18-global-bounded-working-set-resource-contract.md). A
// window/point subscription is just a params tuple, so the SAME logical
// selector MUST always produce the SAME params object: paramsKey identity is
// what makes boot hydration, the `useResource` subscription, and the server
// loader land on ONE per-tuple state. Both codecs are therefore canonical on
// encode and STRICT on decode (malformed params throw — fail loudly; a
// defaulting decode would let `{}` and the default window name the same
// logical window under two paramsKeys, doubling every per-tuple state).
//
// Forward-compat: a future cursor rides as an ADDITIONAL `cursor` key on
// `WindowParams` (absent field = absent key), so cursor-less windows keep
// their paramsKey byte-identical when the cursor slot lands.

/** Ordered-window params: the first `limit` rows of the server-fixed total order. */
export type WindowParams = { limit: string };

/** Explicit point-set params: sorted, deduped, comma-joined row ids. */
export type PointParams = { ids: string };

/** Client-side window selection. `limit` defaults to the descriptor's `defaultLimit`. */
export interface WindowSelector {
  limit?: number;
}

/**
 * A keyed descriptor whose value is a bounded ordered window (`WHERE … ORDER
 * BY … LIMIT n`) over a row collection, per the bounded working-set contract.
 * Carries the window codec so the client hook, the boot paths, and the server
 * compiler all derive params from ONE encode/decode pair (no duplication).
 */
export interface WindowResourceDescriptor<El> extends ResourceDescriptor<
  El[],
  WindowParams
> {
  keyed: { keyOf: (row: unknown) => string };
  /** The canonical default-window params — `window.encode({})`. */
  defaultParams: WindowParams;
  window: {
    /** The window every consumer gets when it names none (client hook default AND server boot default). */
    defaultLimit: number;
    /** Canonical encode: `{ limit }` → `{ limit: "100" }`. Throws on a non-positive/non-integer limit. */
    encode: (sel?: WindowSelector) => WindowParams;
    /** STRICT decode — the server compiler's limit source. Throws on a missing or malformed `limit`. */
    decode: (params: Record<string, string>) => { limit: number };
  };
}

/**
 * A keyed descriptor whose value is an explicit id set (`WHERE pk IN (ids)`) —
 * O(1) per-row reads. `point.decode` is the pure, synchronous, cheap params →
 * ids decode the server runtime reuses as the membership `idsOf` (it runs per
 * subscribed tuple on the feed-routing path).
 */
export interface PointResourceDescriptor<El> extends ResourceDescriptor<
  El[],
  PointParams
> {
  keyed: { keyOf: (row: unknown) => string };
  point: {
    /** Canonical encode: sorted, deduped, comma-joined. Throws on an empty or comma-carrying id. */
    encode: (ids: readonly string[]) => PointParams;
    /** Pure params → ids decode (the server membership `idsOf`). `""` decodes to `[]`. */
    decode: (params: Record<string, string>) => string[];
  };
}
