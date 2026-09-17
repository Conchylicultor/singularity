import type { HookpadKey } from "./schemas";

/**
 * How far before a key change a beat may sit and still count as inside it:
 * Sheet Sage's tolerance, which absorbs floating-point drift in old documents.
 */
const KEY_AT_TOLERANCE = 1e-3;

/**
 * The key in force at a beat. `before-first-key` when the beat comes before
 * every key of the document: a probe the caller branches on (the importer skips
 * the section), never a key to stand in for one.
 */
export type HookpadKeyAtResult<K = HookpadKey> =
  { kind: "found"; key: K } | { kind: "before-first-key" };

/**
 * The key in force at `beat`: the LAST key, in document order, whose beat is at
 * or before it (within 1e-3). Sheet Sage's `theorytab_find_applicable`, the rule
 * its processed dataset was built with — document order, not beat order, so a
 * repeated key at the same beat resolves as the reference does.
 */
export function hookpadKeyAt<K extends Pick<HookpadKey, "beat">>(
  keys: readonly K[],
  beat: number,
): HookpadKeyAtResult<K> {
  let found: K | undefined;
  for (const key of keys) {
    if (beat - key.beat > -KEY_AT_TOLERANCE) found = key;
  }
  return found === undefined
    ? { kind: "before-first-key" }
    : { kind: "found", key: found };
}
