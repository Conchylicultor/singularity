import { z } from "zod";
import type { ZodType } from "zod";
import { keyedResourceDescriptor, type ResourceDescriptor } from "./resource";

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

function assertWindowLimit(limit: number, context: string): void {
  if (!Number.isSafeInteger(limit) || limit <= 0) {
    throw new Error(`${context}: window limit must be a positive integer, got ${limit}`);
  }
}

/**
 * A keyed descriptor whose value is a bounded ordered window (`WHERE … ORDER
 * BY … LIMIT n`) over a row collection, per the bounded working-set contract.
 * Carries the window codec so the client hook, the boot paths, and the server
 * compiler all derive params from ONE encode/decode pair (no duplication).
 */
export interface WindowResourceDescriptor<El>
  extends ResourceDescriptor<El[], WindowParams> {
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
export interface PointResourceDescriptor<El>
  extends ResourceDescriptor<El[], PointParams> {
  keyed: { keyOf: (row: unknown) => string };
  point: {
    /** Canonical encode: sorted, deduped, comma-joined. Throws on an empty or comma-carrying id. */
    encode: (ids: readonly string[]) => PointParams;
    /** Pure params → ids decode (the server membership `idsOf`). `""` decodes to `[]`. */
    decode: (params: Record<string, string>) => string[];
  };
}

/**
 * Declare a bounded ordered-window keyed resource. Wraps
 * `keyedResourceDescriptor` (schema stays `z.array(element)`, so `useResource`
 * callers still get `El[]` and the keyed delta wire is unchanged) and attaches
 * the window codec + the canonical `defaultParams` tuple. The matching server
 * half is `windowQueryResource(descriptor, spec)` in `infra/query-resource`.
 */
export function windowResourceDescriptor<El>(
  key: string,
  elementSchema: ZodType<El>,
  keyOf: (row: unknown) => string,
  opts: { defaultLimit: number; bootCritical?: true },
): WindowResourceDescriptor<El> {
  const { defaultLimit, ...rest } = opts;
  assertWindowLimit(defaultLimit, `windowResourceDescriptor("${key}")`);

  const encode = (sel?: WindowSelector): WindowParams => {
    const limit = sel?.limit ?? defaultLimit;
    assertWindowLimit(limit, `windowResourceDescriptor("${key}").encode`);
    return { limit: String(limit) };
  };
  const decode = (params: Record<string, string>): { limit: number } => {
    const raw = params.limit;
    if (raw === undefined || !/^[1-9][0-9]*$/.test(raw)) {
      throw new Error(
        `windowResourceDescriptor("${key}").decode: params.limit must be a ` +
          `canonical positive-integer string, got ${JSON.stringify(raw)}`,
      );
    }
    return { limit: Number(raw) };
  };

  const d = keyedResourceDescriptor<El[], WindowParams>(
    key,
    z.array(elementSchema),
    [],
    keyOf,
    rest,
  );
  return Object.assign(d, {
    defaultParams: encode(),
    window: { defaultLimit, encode, decode },
  });
}

/**
 * Declare an explicit point-set keyed resource. The id-set codec lives on the
 * descriptor so the client hooks and the server compiler share one encoding;
 * `decode` doubles as the server membership `idsOf`. Point resources are never
 * `bootCritical` (post-mount hydration is the recorded decision — the server
 * cannot know a client's id set at snapshot time). The matching server half is
 * `windowQueryResource(descriptor, spec)` with `point: { by }`.
 */
export function pointResourceDescriptor<El>(
  key: string,
  elementSchema: ZodType<El>,
  keyOf: (row: unknown) => string,
): PointResourceDescriptor<El> {
  const encode = (ids: readonly string[]): PointParams => {
    for (const id of ids) {
      if (id === "" || id.includes(",")) {
        throw new Error(
          `pointResourceDescriptor("${key}").encode: ids must be non-empty and ` +
            `comma-free, got ${JSON.stringify(id)}`,
        );
      }
    }
    return { ids: [...new Set(ids)].sort().join(",") };
  };
  const decode = (params: Record<string, string>): string[] => {
    const raw = params.ids;
    if (raw === undefined) {
      throw new Error(
        `pointResourceDescriptor("${key}").decode: params.ids is missing — a ` +
          `point subscription has no meaning without an id set`,
      );
    }
    return raw === "" ? [] : raw.split(",");
  };

  const d = keyedResourceDescriptor<El[], PointParams>(
    key,
    z.array(elementSchema),
    [],
    keyOf,
  );
  return Object.assign(d, { point: { encode, decode } });
}
