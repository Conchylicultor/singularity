import type { StoryNode } from "./types";

/**
 * Deterministic content hash over a StoryNode forest. Walks nodes in order,
 * folding each node's structural signature (`type|role|depth|JSON(data)`) and
 * its children into a running FNV-1a hash, emitted as a short base36 string.
 *
 * Pure and synchronous — no crypto, no deps. The hash changes whenever any
 * node's type / role / structure / data changes, and is stable across renders
 * for identical input. Used to detect outline staleness per generated unit.
 */
export function hashOutline(nodes: StoryNode[]): string {
  // FNV-1a 32-bit. `>>> 0` keeps the accumulator an unsigned 32-bit int.
  let h = 0x811c9dc5;
  const fold = (s: string): void => {
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    // Per-segment delimiter so concatenation can't alias across boundaries.
    h ^= 0x1f;
    h = Math.imul(h, 0x01000193) >>> 0;
  };
  const walk = (ns: StoryNode[]): void => {
    for (const n of ns) {
      fold(`${n.type}|${n.role}|${n.depth}|${JSON.stringify(n.data)}`);
      walk(n.children);
    }
  };
  walk(nodes);
  return (h >>> 0).toString(36);
}
