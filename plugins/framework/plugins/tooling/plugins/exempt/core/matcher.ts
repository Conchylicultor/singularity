import { covers } from "./resolve";
import type { ResolvedExemption } from "./types";

/** One rule's exemptions, asked file by file. */
export interface ExemptionMatcher {
  readonly rule: string;
  /**
   * The exemption covering the repo-relative `path` for this rule, or
   * undefined. A match RECORDS A HIT on the exemption it returns — call it
   * only for a violation the caller would otherwise report, so an exemption
   * that never suppresses anything is found by {@link ExemptionIndex.unused}.
   * When several cover the path, the most specific (longest target) wins.
   */
  match(path: string): ResolvedExemption | undefined;
}

/**
 * A set of resolved exemptions plus the hits recorded against them. One index
 * per consumer run (one lint pass, one check): hits are what "unused" is
 * measured against, so two consumers must never share an index.
 */
export interface ExemptionIndex {
  readonly all: readonly ResolvedExemption[];
  exemptionsFor(rule: string): ExemptionMatcher;
  /** Exemptions whose target is exactly `path` (file-level ones, for that file). */
  at(path: string): readonly ResolvedExemption[];
  hits(exemption: ResolvedExemption): number;
  /** The exemptions among `candidates` (default: all) that recorded no hit. */
  unused(candidates?: readonly ResolvedExemption[]): ResolvedExemption[];
}

export function createExemptionIndex(
  exemptions: readonly ResolvedExemption[],
): ExemptionIndex {
  const byRule = new Map<string, ResolvedExemption[]>();
  const byTarget = new Map<string, ResolvedExemption[]>();
  for (const e of exemptions) {
    const r = byRule.get(e.rule) ?? [];
    r.push(e);
    byRule.set(e.rule, r);
    const t = byTarget.get(e.target) ?? [];
    t.push(e);
    byTarget.set(e.target, t);
  }
  // Most specific first, so `match` returns the narrowest cover.
  for (const list of byRule.values()) {
    list.sort((a, b) => b.target.length - a.target.length);
  }
  const hitCount = new Map<ResolvedExemption, number>();
  const matchers = new Map<string, ExemptionMatcher>();

  return {
    all: exemptions,
    exemptionsFor(rule) {
      let m = matchers.get(rule);
      if (m === undefined) {
        const list = byRule.get(rule) ?? [];
        m = {
          rule,
          match(path) {
            const hit = list.find((e) => covers(e.target, path));
            if (hit !== undefined) {
              hitCount.set(hit, (hitCount.get(hit) ?? 0) + 1);
            }
            return hit;
          },
        };
        matchers.set(rule, m);
      }
      return m;
    },
    at: (path) => byTarget.get(path) ?? [],
    hits: (e) => hitCount.get(e) ?? 0,
    unused: (candidates = exemptions) =>
      candidates.filter((e) => (hitCount.get(e) ?? 0) === 0),
  };
}

/** One line naming an exemption, for a report: `rule  manifest → path (kind: reason)`. */
export function describeExemption(e: ResolvedExemption): string {
  const kind = e.kind === "debt" ? `debt, task ${e.task}` : "sanctioned";
  return `${e.rule}  ${e.manifest} → "${e.path}" (${kind}: ${e.reason})`;
}
