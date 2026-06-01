import { z } from "zod";

/**
 * A `z.ZodType<T>` that accepts a strict enum value OR any unknown string and
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
 * caller can surface the bad value loudly. Because the union tries `schema`
 * first, `onFallback` never fires for a valid id — only for legacy/unknown
 * input. The caller decides which fallbacks are expected (silent) vs corrupt
 * (loud); this helper just hands it the raw value.
 *
 * Built with `z.union(...)` + a cast rather than `z.preprocess`: `z.preprocess`
 * has `_input = unknown`, which violates `resourceDescriptor`'s
 * `ZodType<T, ZodTypeDef, T>` (`_input === _output === T`) constraint and breaks
 * embedding the field in object schemas used by resources. The union keeps
 * `_input === _output === T`; the cast only hides the `unknown` input the
 * normalize branch absorbs, so it still satisfies the `input === output`
 * contract. Mirrors `RankSchema` in
 * `plugins/primitives/plugins/rank/core/internal/rank.ts`.
 */
export function tolerantEnum<T extends string>(
  schema: z.ZodType<T>,
  normalize: (raw: string) => T,
  onFallback?: (raw: unknown) => void,
): z.ZodType<T> {
  return z.union([
    schema,
    z.unknown().transform((v) => {
      onFallback?.(v);
      return normalize(String(v));
    }),
  ]) as unknown as z.ZodType<T>;
}
