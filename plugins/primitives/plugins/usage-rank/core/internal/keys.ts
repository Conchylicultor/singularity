/**
 * The single-column primary key of a usage rollup.
 *
 * A composite `(namespace, key)` PK is not an option: the `usageStats`
 * collection's row id IS the pk and must be ONE column, so the two halves are
 * joined into one opaque string here — the single place the encoding exists,
 * shared by the client hook, the record endpoint and the SQL upsert.
 *
 * Both halves must be non-empty and comma-free: the id-set codec joins
 * subscribed ids with `,` (`usageStats.rows.point.encode`), so a comma would
 * silently split one id into two. That codec throws on the same condition — we
 * throw HERE, one level earlier, so the message names the namespace/key the
 * caller actually passed rather than the derived id.
 */
export function usageKey(namespace: string, key: string): string {
  if (namespace === "" || key === "") {
    throw new Error(
      `usageKey: namespace and key must be non-empty, got ${JSON.stringify([namespace, key])}`,
    );
  }
  if (namespace.includes(",") || key.includes(",")) {
    throw new Error(
      `usageKey: namespace and key must be comma-free (the id-set codec is comma-joined), got ${JSON.stringify([namespace, key])}`,
    );
  }
  return `${namespace}:${key}`;
}

/**
 * Frecency half-life: a stored score loses half its weight every 30 days.
 *
 * Both sides of the comparison decay to the SAME `now` — the SQL upsert decays
 * the stored score before adding 1, and `decayedScore` decays again at render.
 * Without the second decay, two rows with the same stored score but different
 * `lastUsedAt` would compare as equal even though one is a year stale.
 */
/**
 * The inverse of `usageKey`: the caller's key out of a usage key minted for
 * `namespace`. A usage key from another namespace is a broken assumption about
 * the read that returned it, and throws.
 */
export function keyOfUsage(namespace: string, usage: string): string {
  const prefix = `${namespace}:`;
  if (!usage.startsWith(prefix) || usage.length === prefix.length) {
    throw new Error(
      `keyOfUsage: ${JSON.stringify(usage)} is not a usage key of namespace ${JSON.stringify(namespace)}`,
    );
  }
  return usage.slice(prefix.length);
}

export const HALF_LIFE_MS = 30 * 24 * 60 * 60 * 1000;
