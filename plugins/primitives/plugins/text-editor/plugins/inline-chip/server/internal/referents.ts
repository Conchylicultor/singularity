import { defineServerContribution } from "@plugins/framework/plugins/server-core/core";

/**
 * What one inline token names, answered on the server: the thing it points at
 * still exists and has this title, or there is no such thing. A failed lookup
 * throws — it is not "not found".
 */
export type InlineTokenReferent =
  { found: true; title: string } | { found: false };

/**
 * A chip family's server-side reading of its own tokens, for text a MODEL will
 * read. In the app an id like `proto-1789665568-9onf` renders as a chip showing
 * the prototype's title; handed raw to a model it is an opaque string the model
 * copies into its answer ("Proto-1789665568-9onf theme preview"). A family
 * contributes `resolve` so {@link expandInlineTokenReferents} can hand the
 * model what the chip shows instead.
 *
 * `kind` is the tag name the token expands to (`<prototype id="…" title="…"/>`);
 * `pattern` is the SAME regex the chip declares, imported from the family's
 * `core/`, so the two readings cannot drift.
 */
export const InlineTokenReferentSource = defineServerContribution<{
  kind: string;
  pattern: RegExp;
  resolve(token: string): Promise<InlineTokenReferent>;
}>("primitives.text-editor.inline-chip.referent", {
  // The pattern's source, as `Editor.InlineToken`'s: the join key the
  // `active-data:resolved-chip-has-referent` check matches chips against.
  docLabel: (s) => s.pattern.source,
});

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

interface Span {
  start: number;
  end: number;
  replacement: string;
}

/**
 * `text` with every token a contributed family recognises rewritten as
 * `<kind id="<token>" title="<title>"/>`, so a model reads the referent's name
 * next to its id. A token whose referent does not exist stays as written.
 * Generic: names no family — a new chip family is covered the day it
 * contributes an {@link InlineTokenReferentSource}.
 */
export async function expandInlineTokenReferents(
  text: string,
): Promise<string> {
  const spans: Span[] = [];
  for (const source of InlineTokenReferentSource.getContributions()) {
    const flags = source.pattern.flags.includes("g")
      ? source.pattern.flags
      : `${source.pattern.flags}g`;
    const matches = [
      ...text.matchAll(new RegExp(source.pattern.source, flags)),
    ];
    const tokens = [...new Set(matches.map((m) => m[0]))];
    const referents = new Map(
      await Promise.all(
        tokens.map(async (t) => [t, await source.resolve(t)] as const),
      ),
    );
    for (const m of matches) {
      const referent = referents.get(m[0]);
      if (referent?.found !== true) continue;
      spans.push({
        start: m.index,
        end: m.index + m[0].length,
        replacement: `<${source.kind} id="${escapeAttr(m[0])}" title="${escapeAttr(referent.title)}"/>`,
      });
    }
  }

  // First span wins where two families' patterns overlap; the rest keep order.
  spans.sort((a, b) => a.start - b.start);
  let out = "";
  let cursor = 0;
  for (const span of spans) {
    if (span.start < cursor) continue;
    out += text.slice(cursor, span.start) + span.replacement;
    cursor = span.end;
  }
  return out + text.slice(cursor);
}
