import type { SectionCount } from "./types";

/** A section holding exactly `n` rows. */
export function exactCount(n: number): SectionCount {
  return { kind: "exact", n };
}

/** A section holding at least the `n` rows loaded so far. */
export function atLeastCount(n: number): SectionCount {
  return { kind: "atLeast", n };
}

/**
 * The one spelling of a section count: `n`, or `n+` for a lower bound — so no
 * view can print the rows loaded so far as a total.
 */
export function formatSectionCount(count: SectionCount): string {
  return count.kind === "exact" ? String(count.n) : `${count.n}+`;
}
