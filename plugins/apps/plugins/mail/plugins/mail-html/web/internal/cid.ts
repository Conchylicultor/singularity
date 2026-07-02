/**
 * Parse a `cid:` image source into its bare Content-ID (no `cid:` scheme, no
 * surrounding angle brackets, no whitespace). Returns null for any non-`cid:`
 * source. Pure string logic — the DOM walk uses this to key `resolveCid`.
 *
 * Email inline images reference an attachment part by Content-ID:
 *   <img src="cid:ii_abc123@mail.gmail.com">
 * The MIME part's `Content-ID` header stores it wrapped in angle brackets
 * (`<ii_abc123@mail.gmail.com>`), so callers strip the brackets when indexing.
 */
export function parseCidSrc(src: string): string | null {
  const m = /^\s*cid:(.*)$/is.exec(src);
  if (!m) return null;
  return (m[1] ?? "")
    .trim()
    .replace(/^<+/, "")
    .replace(/>+$/, "")
    .trim();
}
