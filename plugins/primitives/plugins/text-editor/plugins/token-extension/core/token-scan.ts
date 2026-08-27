import type { InlineTokenExtension } from "./token-extension";
import type { TokenFields } from "./inline-token-types";

/**
 * THE line scan. One walk, three consumers: the page editor's runs->Lexical
 * mapping, the prompt editor's markdown deserialization, and (from the same
 * matches) any read-only renderer that paints a token without Lexical.
 *
 * It used to exist three times, and the copies had already drifted — one sorted
 * and dropped overlaps, one raced two regexes against each other, and none of
 * them looked at the run's marks.
 */

/**
 * The mark that means "these characters are verbatim, not prose".
 *
 * Spelled here rather than imported: this primitive sits BELOW every content
 * model that has a mark vocabulary (the page editor's `Mark` union is one; the
 * prompt editor has none at all), so it states the rule and each host's mark
 * type flows in as `readonly string[]`.
 */
export const CODE_MARK = "code";

/**
 * One token found in a line.
 *
 * `fields` is the ERASED record, not a family's own `F`: the scan walks a
 * homogeneous list of extensions, so at the point a match is produced there is
 * no single `F` to speak of. A consumer that wants a node asks the matching
 * extension to build one from {@link TokenMatch.match} — the family reads its
 * own fields back out, so nothing has to carry a type it cannot name.
 */
export interface TokenMatch<
  E extends TokenScanExtension = InlineTokenExtension,
> {
  /** Index of the token's first character in the scanned text. */
  start: number;
  /** Index one past the token's last character. */
  end: number;
  /** The matched token text. */
  text: string;
  /** The fields the token encodes. */
  fields: TokenFields;
  /** The extension that matched — its `node` builds or renders the token. */
  extension: E;
  /** The raw match, for a consumer that needs a group the fields elide. */
  match: RegExpExecArray;
}

/**
 * All the scan asks of an extension: WHERE a token is (`pattern`) and WHAT it
 * encodes (`node.fieldsOf`). Nothing else.
 *
 * Stated as its own (structural) type, and {@link matchTokens} generic in it,
 * because a host's registry entry is usually WIDER than an
 * {@link InlineTokenExtension} — the page editor's `BlockTextExtension` carries
 * a read-only renderer alongside the Lexical halves. Keeping the caller's own
 * type on {@link TokenMatch.extension} is what lets a consumer render straight
 * off a match instead of joining back to its registry by id, which is a string
 * key nothing checks.
 */
export interface TokenScanExtension {
  /** Non-global pattern matching one token within a single line. */
  readonly pattern: RegExp;
  /** The family that reads a match back into fields. */
  readonly node: {
    fieldsOf(match: RegExpExecArray): TokenFields | null;
  };
}

/**
 * Every token in `text`, in document order, non-overlapping.
 *
 * - A run carrying the `code` mark yields NOTHING. Writing `` `att-…` `` as
 *   inline code is how a person documents an id, and turning it into a live
 *   widget both loses the code styling and asserts a link the author did not
 *   write. Stated here so it holds for the editor seed, the read-only renderer
 *   and every token family at once. Pass `undefined` from a host with no marks.
 * - Each extension is scanned with a FRESH `/g` regex: a `pattern` may carry
 *   `/g` of its own, whose `lastIndex` is stateful across calls.
 * - A match whose `fieldsOf` returns `null` is not a token at all (an image
 *   markdown link pointing somewhere other than an attachment), so it neither
 *   appears in the result nor consumes the span.
 * - Overlaps: matches are sorted by start and any match beginning inside an
 *   already-taken span is dropped. First-by-position wins.
 */
export function matchTokens<E extends TokenScanExtension>(
  text: string,
  marks: readonly string[] | undefined,
  extensions: readonly E[],
): TokenMatch<E>[] {
  if (extensions.length === 0) return [];
  if (marks?.includes(CODE_MARK)) return [];

  const found: TokenMatch<E>[] = [];
  for (const extension of extensions) {
    const re = new RegExp(extension.pattern.source, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      // A zero-length match never advances `lastIndex` — bump it or the loop
      // never ends. No shipped pattern can match empty, so this is a bound, not
      // a behaviour.
      if (m[0].length === 0) {
        re.lastIndex += 1;
        continue;
      }
      const fields = extension.node.fieldsOf(m);
      if (fields === null) continue;
      found.push({
        start: m.index,
        end: m.index + m[0].length,
        text: m[0],
        fields,
        extension,
        match: m,
      });
    }
  }

  found.sort((a, b) => a.start - b.start);
  const out: TokenMatch<E>[] = [];
  let lastIdx = 0;
  for (const match of found) {
    if (match.start < lastIdx) continue;
    out.push(match);
    lastIdx = match.end;
  }
  return out;
}

/**
 * Does `text` carry at least one of these extensions' tokens?
 *
 * The gate a paste path uses to decide between "deserialize into nodes" and
 * "let the host insert plain text". Pattern-level only (it asks whether the
 * bytes LOOK like a token), and marks are not a question a clipboard payload
 * can answer.
 */
export function hasToken(
  text: string,
  extensions: readonly TokenScanExtension[],
): boolean {
  // Fresh, flagless RegExp per test — see the `/g` note on `matchTokens`.
  return extensions.some((ext) => new RegExp(ext.pattern.source).test(text));
}
