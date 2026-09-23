import { isTestCodePath } from "@plugins/framework/plugins/plugin-id/core";
import type { DocFact } from "@plugins/plugin-meta/plugins/facets/core";

// A repo path or `@plugins/…` specifier inside a rendered fact value. Facts
// render paths in backticks (`plugins/x/server/tables.ts`) and specifiers bare
// or in backticks; both start at one of these two roots.
const PATH_TOKEN_RE = /@?plugins\/[\w./@-]+/g;

/**
 * The paths inside `facts` that name test code (`isTestCodePath`).
 *
 * The generated docs describe what a plugin ships. Each facet enumerates source
 * on its own, so each one could get the test-code skip wrong: one did, and listed
 * a `server/testing/` harness as DB schema. This check reads the OUTPUT instead
 * of trusting every walker, so the next facet that walks by hand fails the build
 * rather than quietly documenting test code as public surface.
 */
export function testCodeInFacts(facts: readonly DocFact[]): string[] {
  const hits = new Set<string>();
  for (const fact of facts) {
    for (const value of fact.values) {
      for (const [token] of value.matchAll(PATH_TOKEN_RE)) {
        if (isTestCodePath(token.split("/"))) hits.add(token);
      }
    }
  }
  return [...hits].sort();
}

/** Throws when a facet's rendered facts name test code (see `testCodeInFacts`). */
export function assertNoTestCodeInFacts(opts: {
  pluginId: string;
  facetId: string;
  facts: readonly DocFact[];
}): void {
  const hits = testCodeInFacts(opts.facts);
  if (hits.length === 0) return;
  throw new Error(
    `docgen: facet "${opts.facetId}" documented test code for plugin ${opts.pluginId}:\n` +
      hits.map((h) => `  ${h}`).join("\n") +
      `\n  The generated docs describe what a plugin ships; \`*.test.ts(x)\`, ` +
      `\`__tests__/\` and \`<runtime>/testing/\` are test code. Enumerate source ` +
      `with parse-utils' \`walkFiles\`, which skips it.`,
  );
}
