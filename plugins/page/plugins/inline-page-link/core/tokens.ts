// Inline page links are stored as `[[<pageId>]]` tokens inside a block's plain
// `data.text` string (no schema change). Page/block ids have the shape
// `block-<epochMillis>-<base36>` (see editor's handle-create-block), NOT UUIDs —
// the id-restricted pattern keeps the parser from hijacking arbitrary `[[…]]`
// text a user might type. This is the single source of truth for the token format,
// shared by the web inline node and the server backlinks extractor.

/** Non-global pattern matching one inline page-link token; group 1 is the id. */
export const PAGE_LINK_TOKEN_PATTERN = /\[\[(block-\d+-[a-z0-9]+)\]\]/;

/** Serialize a page id to its inline token. */
export function pageLinkToken(pageId: string): string {
  return `[[${pageId}]]`;
}

/** Extract every linked page id from a block's text (in document order). */
export function scanPageLinkTokens(text: string): string[] {
  const re = new RegExp(PAGE_LINK_TOKEN_PATTERN.source, "g");
  const ids: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) ids.push(m[1]!);
  return ids;
}
