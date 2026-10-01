import { createHash } from "node:crypto";

/**
 * JSON with every object's keys sorted, so two configs that say the same thing
 * spell the same string. Array order is kept: whether it matters is the source
 * type's business, and a spurious re-extract is the safe direction to err in.
 */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * The key the engine caches extraction on: the probe's fingerprint of the raw
 * material AND the source's config.
 *
 * `extract` is a function of both — a source type is free to apply its config
 * there (SalsaNueva's filters, a category picker) rather than in `probe`. Keying
 * on the material alone made a config edit a cache hit: the page had not moved,
 * so the new filters were never applied. Folding the config in HERE, in the
 * engine, means no source type has to remember to fingerprint its own config.
 *
 * `null` stays `null`: a source that cannot fingerprint cheaply always extracts,
 * whatever its config.
 */
export function extractionCacheKey(
  config: unknown,
  fingerprint: string | null,
): string | null {
  if (fingerprint === null) return null;
  return createHash("sha256")
    .update(canonicalJson(config))
    .update("\0")
    .update(fingerprint)
    .digest("hex");
}
