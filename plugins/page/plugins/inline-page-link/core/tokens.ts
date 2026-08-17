// Inline page links are stored as `[[page:<pageId>]]` tokens inside a block's
// plain `data.text` string (no schema change), mirroring the sibling
// `inline-date` tokens. This is the single source of truth for the token
// format, shared by the web inline node and the server backlinks extractor.
//
// The `page:` NAMESPACE is what disambiguates a link from arbitrary `[[…]]`
// text a user might type — so the id body needs no shape constraint, which is
// the whole point. A block id is an OPAQUE key (`editor/core/block-id.ts`:
// "Nothing parses this format, and nothing may start"), and the retired pattern
// destructured one: it required `block-<epochMillis>-<base36>`, so when the mint
// moved to `block-<uuid>` every inline link went dark — no chip on re-parse, no
// backlinks edge — silently, because the token still LOOKED right in the text.

/**
 * Non-global pattern matching one inline page-link token. Group 1 = the id in
 * the current namespaced form; group 2 = the id in the pre-namespace form,
 * which is READ-ONLY compatibility (nothing mints it any more). Exactly one of
 * the two alternatives matches per token, so a reader takes `m[1] ?? m[2]`.
 */
export const PAGE_LINK_TOKEN_PATTERN =
  /\[\[(?:page:([^[\]\n]+)|(block-\d+-[a-z0-9]+))\]\]/;

/** Serialize a page id to its inline token. */
export function pageLinkToken(pageId: string): string {
  return `[[page:${pageId}]]`;
}

/** Extract every linked page id from a block's text (in document order). */
export function scanPageLinkTokens(text: string): string[] {
  const re = new RegExp(PAGE_LINK_TOKEN_PATTERN.source, "g");
  const ids: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) ids.push(m[1] ?? m[2]!);
  return ids;
}
