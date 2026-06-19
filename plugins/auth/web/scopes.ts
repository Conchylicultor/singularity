/**
 * Pure scope-set helpers for the consumer-declared OAuth scopes flow.
 * No React, no imports — load-bearing union/diff math.
 */

/**
 * Scopes in `required` that are not present in `granted`, de-duplicated and in
 * the original order of `required`. `granted` undefined is treated as `[]`.
 */
export function missingScopes(
  required: string[],
  granted: string[] | undefined,
): string[] {
  const have = new Set(granted ?? []);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const scope of required) {
    if (have.has(scope) || seen.has(scope)) continue;
    seen.add(scope);
    out.push(scope);
  }
  return out;
}

/**
 * Order-preserving dedupe union across all lists (undefined lists are skipped).
 */
export function mergeScopes(...lists: (string[] | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of lists) {
    if (!list) continue;
    for (const scope of list) {
      if (seen.has(scope)) continue;
      seen.add(scope);
      out.push(scope);
    }
  }
  return out;
}
