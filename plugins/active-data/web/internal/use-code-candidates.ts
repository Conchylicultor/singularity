import { useMemo } from "react";
import type { SealContributions } from "@plugins/framework/plugins/web-sdk/core";
import { ActiveData, type ActiveDataCodeContribution } from "../slots";
import type { CodeResolver } from "../claim";

/**
 * One `display:"code"` contribution, prepared for the arbitration chain: the
 * syntactic gate precompiled once (instead of `new RegExp(...)` per code span per
 * render) and the semantic gate carried alongside it.
 */
export interface CodeCandidate {
  /** Contribution id — the chain's remount key and the dev-time uniqueness key. */
  id: string;
  /** The contribution's `pattern`, without `g` so `exec` carries no `lastIndex`. */
  test: RegExp;
  resolver: CodeResolver<unknown>;
}

/**
 * The syntactic gate: a candidate is in the chain only if its pattern matches the
 * WHOLE code text. `exec` finds the leftmost match, so requiring `m[0] === text`
 * rejects a pattern that merely matches a substring.
 */
export function fullMatch(test: RegExp, text: string): boolean {
  const m = test.exec(text);
  return m !== null && m[0] === text;
}

/** Does any registered code contribution syntactically match this code span? */
export function anyCandidateMatches(
  candidates: readonly CodeCandidate[],
  text: string,
): boolean {
  return candidates.some((c) => fullMatch(c.test, text));
}

/**
 * The registered `display:"code"` contributions in registry order — applied only
 * to inline code elements (full-text match), never to regular paragraph text
 * nodes. Consumed by `ActiveDataCodeChain`, which arbitrates between them.
 */
export function useActiveDataCodeCandidates(): CodeCandidate[] {
  const contributions = ActiveData.Tag.useContributions();
  return useMemo(() => {
    const codeContribs = contributions.filter(
      (c): c is SealContributions<ActiveDataCodeContribution> =>
        c.display === "code",
    );
    if (process.env.NODE_ENV !== "production") {
      const seen = new Set<string>();
      for (const c of codeContribs) {
        if (seen.has(c.id)) {
          console.error(
            `[active-data] duplicate display:"code" contribution id "${c.id}". The id keys the arbitration chain (remount identity + doc label); two contributions sharing one id make the chain's behaviour depend on registry order. Give each contribution a unique id.`,
          );
        }
        seen.add(c.id);
      }
    }
    return codeContribs.map((c) => ({
      id: c.id,
      test: new RegExp(c.pattern.source, c.pattern.flags.replace("g", "")),
      resolver: c.resolver,
    }));
  }, [contributions]);
}
