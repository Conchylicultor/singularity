/**
 * Normalize a known provider URL to its embeddable form. Anything we don't
 * recognize (or can't parse) falls through to the raw URL unchanged.
 *
 * Pure function — no I/O, no DOM — so it's unit-testable in isolation.
 */
export function toEmbedUrl(raw: string): string {
  let u: URL;
  try {
    u = new URL(raw);
  } catch (err) {
    // `new URL` throws TypeError on an unparseable absolute URL — the expected
    // case here; hand back whatever we were given. Re-throw anything else.
    if (!(err instanceof TypeError)) throw err;
    return raw;
  }

  const host = u.hostname.replace(/^www\./, "").toLowerCase();

  // YouTube: youtube.com/watch?v=ID, youtu.be/ID, youtube.com/shorts/ID
  if (host === "youtube.com" || host === "m.youtube.com") {
    const v = u.searchParams.get("v");
    if (v) return `https://www.youtube.com/embed/${v}`;
    const shorts = u.pathname.match(/^\/shorts\/([^/?#]+)/);
    if (shorts) return `https://www.youtube.com/embed/${shorts[1]}`;
    const embed = u.pathname.match(/^\/embed\/([^/?#]+)/);
    if (embed) return `https://www.youtube.com/embed/${embed[1]}`;
  }
  if (host === "youtu.be") {
    const id = u.pathname.replace(/^\//, "").split(/[/?#]/)[0];
    if (id) return `https://www.youtube.com/embed/${id}`;
  }

  // Vimeo: vimeo.com/ID
  if (host === "vimeo.com") {
    const id = u.pathname.replace(/^\//, "").split(/[/?#]/)[0] ?? "";
    if (/^\d+$/.test(id)) return `https://player.vimeo.com/video/${id}`;
  }

  // Spotify: open.spotify.com/<type>/<id>
  if (host === "open.spotify.com") {
    const m = u.pathname.match(/^\/([^/]+)\/([^/?#]+)/);
    if (m) return `https://open.spotify.com/embed/${m[1]}/${m[2]}`;
  }

  return raw;
}
