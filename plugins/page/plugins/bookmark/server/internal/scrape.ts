import { HttpError } from "@plugins/infra/plugins/endpoints/server";
import { createAttachment } from "@plugins/infra/plugins/attachments/server";
import type { LinkPreview } from "../../core";

const FETCH_TIMEOUT_MS = 8000;
const MAX_REDIRECTS = 5;
const MAX_HTML_BYTES = 512 * 1024; // cap the HTML we parse
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // cap downloaded images
const USER_AGENT =
  "Mozilla/5.0 (compatible; SingularityBot/1.0; +link-preview)";

/**
 * Reject loopback / private-range / link-local hosts to prevent SSRF against
 * the local network. Hostname only — DNS-rebinding hardening is a follow-up.
 */
function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, ""); // strip IPv6 brackets

  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host === "0.0.0.0" || host === "::1") return true;
  // IPv6 unique-local (fc00::/7) and link-local (fe80::/10)
  if (host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80"))
    return true;

  // Private / loopback / link-local IPv4 ranges.
  if (host.startsWith("127.")) return true;
  if (host.startsWith("10.")) return true;
  if (host.startsWith("192.168.")) return true;
  if (host.startsWith("169.254.")) return true;
  const match172 = /^172\.(\d{1,3})\./.exec(host);
  if (match172) {
    const second = Number(match172[1]);
    if (second >= 16 && second <= 31) return true;
  }
  return false;
}

/**
 * Fetch with per-hop SSRF revalidation. `redirect: "follow"` would let a public
 * URL 30x-redirect to a private/loopback host (cloud metadata, internal service),
 * defeating the initial guard — so we follow manually and re-guard every hop.
 */
async function safeFetch(initial: URL): Promise<Response> {
  let url = initial;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await fetch(url.toString(), {
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { "user-agent": USER_AGENT },
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) return res;
      // Re-guard the redirect target before following it.
      url = guardUrl(new URL(loc, url).toString());
      continue;
    }
    return res;
  }
  throw new HttpError(502, "Too many redirects");
}

/** Parse + SSRF-guard a URL. Throws HttpError(400) on a disallowed target. */
function guardUrl(raw: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch (err) {
    // `new URL` throws TypeError on an unparseable url — surface as a 400. Any
    // other (unexpected) error propagates.
    if (!(err instanceof TypeError)) throw err;
    throw new HttpError(400, "Invalid URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new HttpError(400, "Only http(s) URLs are supported");
  }
  if (isBlockedHost(parsed.hostname)) {
    throw new HttpError(400, "URL host is not allowed");
  }
  return parsed;
}

interface ScrapedMeta {
  title?: string;
  description?: string;
  siteName?: string;
  imageUrl?: string;
  faviconUrl?: string;
}

/**
 * Stream the HTML through Bun's built-in HTMLRewriter, accumulating the meta
 * fields we care about. We `.transform(res)` to get a streaming Response, then
 * `await transformed.text()` to drive the handlers to completion. A byte cap
 * stops accumulation once we've seen enough markup (handlers still run, but we
 * ignore further input).
 */
async function scrapeMeta(res: Response, finalUrl: string): Promise<ScrapedMeta> {
  const meta: ScrapedMeta = {};
  const ogImageCandidates: { og?: string; twitter?: string } = {};
  const titleCandidates: { og?: string; twitter?: string; tag?: string } = {};
  const descCandidates: { og?: string; twitter?: string; meta?: string } = {};

  let bytesSeen = 0;
  let inHeadTitle = false;
  let titleText = "";

  const rewriter = new HTMLRewriter()
    .on("meta", {
      element(el) {
        if (bytesSeen > MAX_HTML_BYTES) return;
        const property = el.getAttribute("property")?.toLowerCase();
        const name = el.getAttribute("name")?.toLowerCase();
        const content = el.getAttribute("content") ?? undefined;
        if (!content) return;
        const key = property ?? name;
        if (!key) return;
        switch (key) {
          case "og:title":
            titleCandidates.og ??= content;
            break;
          case "twitter:title":
            titleCandidates.twitter ??= content;
            break;
          case "og:description":
            descCandidates.og ??= content;
            break;
          case "twitter:description":
            descCandidates.twitter ??= content;
            break;
          case "description":
            descCandidates.meta ??= content;
            break;
          case "og:site_name":
            meta.siteName ??= content;
            break;
          case "og:image":
          case "og:image:url":
          case "og:image:secure_url":
            ogImageCandidates.og ??= content;
            break;
          case "twitter:image":
          case "twitter:image:src":
            ogImageCandidates.twitter ??= content;
            break;
          default:
            break;
        }
      },
    })
    .on("link", {
      element(el) {
        if (bytesSeen > MAX_HTML_BYTES) return;
        const rel = el.getAttribute("rel")?.toLowerCase() ?? "";
        const href = el.getAttribute("href") ?? undefined;
        if (!href) return;
        // rel may be a space-separated token list (e.g. "shortcut icon").
        const rels = rel.split(/\s+/);
        if (rels.includes("icon") && !meta.faviconUrl) {
          meta.faviconUrl = href;
        }
      },
    })
    .on("title", {
      element() {
        if (bytesSeen > MAX_HTML_BYTES) return;
        inHeadTitle = true;
      },
      text(chunk) {
        if (!inHeadTitle) return;
        titleText += chunk.text;
        if (chunk.lastInTextNode) inHeadTitle = false;
      },
    })
    .on("*", {
      // Cheap running byte counter so we stop honoring elements once we've seen
      // enough of the document head.
      element() {
        bytesSeen += 1;
      },
    });

  const transformed = rewriter.transform(res);
  await transformed.text(); // drive the stream to completion

  titleCandidates.tag = titleText.trim() || undefined;
  meta.title = titleCandidates.og ?? titleCandidates.twitter ?? titleCandidates.tag;
  meta.description =
    descCandidates.og ?? descCandidates.twitter ?? descCandidates.meta;

  const rawImage = ogImageCandidates.og ?? ogImageCandidates.twitter;
  meta.imageUrl = resolveUrl(rawImage, finalUrl);

  // Favicon: resolve the discovered <link rel=icon>, else default to /favicon.ico.
  if (meta.faviconUrl) {
    meta.faviconUrl = resolveUrl(meta.faviconUrl, finalUrl);
  } else {
    try {
      meta.faviconUrl = new URL("/favicon.ico", finalUrl).toString();
    } catch (err) {
      if (!(err instanceof TypeError)) throw err;
      meta.faviconUrl = undefined;
    }
  }
  return meta;
}

function resolveUrl(value: string | undefined, base: string): string | undefined {
  if (!value) return undefined;
  try {
    return new URL(value, base).toString();
  } catch (err) {
    if (!(err instanceof TypeError)) throw err;
    return undefined;
  }
}

/**
 * Best-effort download of a remote image into an attachment. Degrades to
 * `undefined` for any expected condition (missing/oversized/non-image/blocked)
 * — a missing image just means no imageId, not an error.
 */
async function cacheImage(
  rawUrl: string | undefined,
  fallbackName: string,
): Promise<string | undefined> {
  if (!rawUrl) return undefined;
  let parsed: URL;
  try {
    parsed = guardUrl(rawUrl);
  } catch (err) {
    // guardUrl throws HttpError for a blocked/invalid image host → skip (not an
    // error for a best-effort image). Anything else is unexpected → propagate.
    if (!(err instanceof HttpError)) throw err;
    return undefined;
  }
  const res = await safeFetch(parsed).catch(() => undefined);
  if (!res || !res.ok) return undefined;

  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/")) return undefined;

  const buf = await res.arrayBuffer().catch(() => undefined);
  if (!buf) return undefined;
  if (buf.byteLength === 0 || buf.byteLength > MAX_IMAGE_BYTES) return undefined;

  const mime = contentType.split(";")[0]?.trim() || "application/octet-stream";
  const name = fileNameFor(parsed, fallbackName, mime);
  const attachment = await createAttachment(new Uint8Array(buf), name, mime);
  return attachment.id;
}

function fileNameFor(url: URL, fallback: string, mime: string): string {
  const last = url.pathname.split("/").filter(Boolean).at(-1);
  if (last && /\.[a-z0-9]{2,5}$/i.test(last)) return last;
  const ext = mime.split("/")[1]?.split("+")[0] ?? "img";
  return `${fallback}.${ext}`;
}

export async function scrapeLinkPreview(url: string): Promise<LinkPreview> {
  const target = guardUrl(url);

  const res = await safeFetch(target);
  if (!res.ok) {
    throw new HttpError(502, `Failed to fetch URL (status ${res.status})`);
  }

  // The final URL after redirects, used to resolve relative image/favicon paths.
  const finalUrl = res.url || target.toString();
  const meta = await scrapeMeta(res, finalUrl);

  // Download og:image + favicon best-effort. Degrade gracefully on missing.
  const [imageId, faviconId] = await Promise.all([
    cacheImage(meta.imageUrl, "preview"),
    cacheImage(meta.faviconUrl, "favicon"),
  ]);

  return {
    title: meta.title,
    description: meta.description,
    siteName: meta.siteName,
    imageId,
    faviconId,
  };
}
