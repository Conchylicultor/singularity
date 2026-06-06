import type { FieldIdentity } from "./types";

/** [typeId, ...ancestors] following `extends`; cycle-guarded; unknown ids resolve to [typeId]. */
export function resolveTypeChain(
  typeId: string,
  identities: ReadonlyMap<string, FieldIdentity>,
): string[] {
  const chain: string[] = [];
  const seen = new Set<string>();
  let cur: string | undefined = typeId;
  while (cur && !seen.has(cur)) {
    chain.push(cur);
    seen.add(cur);
    cur = identities.get(cur)?.extends?.id;
  }
  return chain;
}
