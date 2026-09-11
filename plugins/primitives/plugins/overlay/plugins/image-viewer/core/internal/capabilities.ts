/**
 * What the viewer's file actions can do with an image, worked out from its
 * address alone — so no caller passes copy / download / open flags, and no
 * caller can offer an action the browser would refuse.
 */

/**
 * How "Open original" reaches the image:
 * - `url` — open the address as-is in a new tab.
 * - `blob-url` — a `data:` image: browsers refuse to navigate a new tab to a
 *   `data:` URL, so it is turned into a `blob:` URL first ({@link dataUriToBlob}).
 * - `none` — the image cannot be opened safely (see {@link imageCapabilities}).
 */
export type OpenVia = "url" | "blob-url" | "none";

export interface ImageCapabilities {
  readonly open: OpenVia;
  /** Copy to the clipboard (re-encoded to PNG, the format the clipboard takes). */
  readonly copy: boolean;
  /** Save with the image's name through an `<a download>`. */
  readonly download: boolean;
}

/** Raster types a `data:` image may be opened as. SVG is excluded on purpose:
 *  a `blob:` URL inherits this app's origin, so an SVG carrying a script would
 *  run with the app's privileges in the new tab. */
const OPENABLE_DATA_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/avif",
  "image/bmp",
]);

/**
 * The actions available for the image at `src`, as seen from `origin` (the
 * page's `location.origin`).
 *
 * - `data:`, `blob:` and same-origin images: the browser lets the page read
 *   their pixels, so they can be copied and downloaded.
 * - Another site's image: its pixels are off-limits to the page (a canvas it is
 *   drawn on is tainted) and `download` is ignored cross-origin, so it only
 *   gets "Open original".
 * - Only `http(s):`, `blob:` and raster `data:` addresses are opened at all.
 *
 * `src` may be relative; it resolves against `origin`. An address that cannot
 * be parsed throws — the image could not have loaded either.
 */
export function imageCapabilities(
  src: string,
  origin: string,
): ImageCapabilities {
  // Decided on the prefix, before `new URL`: a pasted screenshot's data: URI is
  // megabytes long, and parsing it only to read back "data:" is wasted work.
  if (src.startsWith("data:")) {
    return {
      open: OPENABLE_DATA_TYPES.has(dataUriType(src)) ? "blob-url" : "none",
      copy: true,
      download: true,
    };
  }
  const url = new URL(src, origin);
  switch (url.protocol) {
    case "blob:":
      return { open: "url", copy: true, download: true };
    case "http:":
    case "https:": {
      const same = url.origin === new URL(origin).origin;
      return { open: "url", copy: same, download: same };
    }
    default:
      return { open: "none", copy: false, download: false };
  }
}

/** A parsed `data:` URI header. */
interface DataUriHeader {
  readonly type: string;
  readonly base64: boolean;
  /** Index of the first payload character. */
  readonly start: number;
}

function parseDataUri(uri: string): DataUriHeader {
  if (!uri.startsWith("data:")) {
    throw new Error(`Not a data: URI: ${uri.slice(0, 32)}`);
  }
  const comma = uri.indexOf(",");
  if (comma < 0) throw new Error("Malformed data: URI (no comma)");
  const params = uri.slice(5, comma).split(";");
  return {
    // RFC 2397: an omitted media type means text/plain.
    type: (params[0] || "text/plain").toLowerCase(),
    base64: params.slice(1).includes("base64"),
    start: comma + 1,
  };
}

/** The media type a `data:` URI declares, lower-cased. */
export function dataUriType(uri: string): string {
  return parseDataUri(uri).type;
}

/** Decode a `data:` URI into a Blob of its declared type, without a network
 *  round-trip. Throws on anything that is not a well-formed `data:` URI. */
export function dataUriToBlob(uri: string): Blob {
  const h = parseDataUri(uri);
  const payload = uri.slice(h.start);
  if (!h.base64) {
    return new Blob([decodeURIComponent(payload)], { type: h.type });
  }
  const bin = atob(payload);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: h.type });
}
