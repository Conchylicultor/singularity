import type { Check } from "@plugins/framework/plugins/tooling/core";

/**
 * A check's contribution to its cache key, resolved: `""` when it declares no
 * `cacheSignature()` (keyed on the tree hash alone), its value otherwise —
 * awaited, since a signature that needs git is async. `null` means "never
 * cache". The runner never names checks.
 *
 * A throw or a rejection is `null` too: a signature that cannot be computed
 * costs the cache, never the run.
 */
export async function resolveCacheSignature(
  check: Check,
): Promise<string | null> {
  if (!check.cacheSignature) return "";
  try {
    return await check.cacheSignature();
    // eslint-disable-next-line promise-safety/no-bare-catch, promise-safety/no-absorbed-failure -- a cacheSignature() failure of any kind (throw or rejection) degrades to uncached — null is "do not cache", the safe side, never a stale pass; propagating would abort the check run, which is a worse outcome than skipping the cache
  } catch {
    return null;
  }
}
