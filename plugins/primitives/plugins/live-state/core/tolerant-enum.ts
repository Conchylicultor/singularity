import { z } from "zod";
import type { ZodParser } from "@plugins/packages/plugins/zod-parser/core";

/**
 * A `ZodParser<T>` that accepts a strict enum value OR any unknown string and
 * normalizes it to a valid `T`. Use for persisted fields backed by an evolving
 * enum (e.g. a model id whose value set changes over time): a legacy/unknown
 * stored value degrades to a concrete `T` instead of rejecting the payload.
 *
 * This matters because live resources parse the whole `z.array(...)` atomically
 * — a single stale row would otherwise throw a `ZodError` on the WS push path
 * and blank the entire list. Tolerating at the field makes that impossible by
 * construction.
 *
 * Per the "fail loudly" rule this is opt-in per field, not a blanket wrapper:
 * every other field still rejects bad input. And the degrade is no longer
 * silent: the optional `onFallback` callback fires for any value that failed
 * the strict `schema` (i.e. needed normalizing) BEFORE it is normalized, so the
 * caller can surface the bad value loudly. It never fires for a valid id — only
 * for legacy/unknown input. The caller decides which fallbacks are expected
 * (silent) vs corrupt (loud); this helper just hands it the raw value.
 *
 * `normalize`'s own output is re-validated by `schema`, so a normalizer that
 * returns something outside the enum still fails loudly rather than smuggling
 * an invalid value through.
 */
export function tolerantEnum<T extends string>(
  schema: ZodParser<T>,
  normalize: (raw: string) => T,
  onFallback?: (raw: unknown) => void,
): ZodParser<T> {
  return z.preprocess((raw) => {
    if (schema.safeParse(raw).success) return raw;
    onFallback?.(raw);
    return normalize(String(raw));
  }, schema);
}
