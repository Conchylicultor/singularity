import { NonRetryableError } from "@plugins/infra/plugins/jobs/server";
import { parsePublicUrl, safeFetch } from "@plugins/infra/plugins/safe-fetch/server";
import type { ProbeContext, ProbeResult } from "@plugins/apps/plugins/events/plugins/events-core/server";
import type { UrlSourceConfig } from "../../core";
import { extractVisibleText, fingerprintPageText } from "./page-text";
import { readUrlSourceConfig } from "./source-config";

/** A hard bound on the markup we parse — a page, not a download. */
const MAX_HTML_BYTES = 256 * 1024;

const USER_AGENT =
  "Mozilla/5.0 (compatible; SingularityBot/1.0; +events-extractor)";

/**
 * What `probe` hands `extract`: the page's already-read visible text, so the
 * expensive phase costs no second fetch.
 */
export interface UrlPagePayload {
  /** The URL after redirects — what the model is told it is reading. */
  url: string;
  /** The normalized visible text the fingerprint was taken over. */
  text: string;
}

/**
 * Read at most `max` bytes of the body, then cancel the download.
 *
 * A real bound, not a counter consulted after the fact: the reader is cancelled
 * the moment we have enough, so a URL that turns out to point at a
 * multi-gigabyte file costs 256 KB. Truncated markup is fine — the rewriter is a
 * streaming parser and simply stops mid-document.
 *
 * Read into bytes rather than piped through a capping `TransformStream` because
 * Bun's `HTMLRewriter.transform()` cannot consume a `Response` whose body is a
 * JS `TransformStream` (`ERR_STREAM_CANNOT_PIPE`, Bun 1.3.13).
 */
export async function readCappedBody(
  body: ReadableStream<Uint8Array>,
  max: number,
): Promise<Uint8Array> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let seen = 0;
  try {
    while (seen < max) {
      const { done, value } = await reader.read();
      if (done) break;
      const room = max - seen;
      const slice = value.byteLength <= room ? value : value.subarray(0, room);
      chunks.push(slice);
      seen += slice.byteLength;
    }
  } finally {
    await reader.cancel();
  }
  const out = new Uint8Array(seen);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

/**
 * A 4xx is the user's URL being wrong (a typo, a deleted page, a login wall) —
 * the same request fails identically forever, so it is terminal and parks the
 * source with something actionable on it. 408/429 and every 5xx are the server
 * having a moment: a plain throw, which the refresh job retries.
 */
function assertFetched(res: Response, url: string): void {
  if (res.ok) return;
  const detail = `${res.status} fetching ${url}`;
  if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
    throw new NonRetryableError(`Page returned ${detail}`);
  }
  throw new Error(`Page returned ${detail}`);
}

/**
 * The cheap phase: fetch the page and fingerprint what a reader would see.
 *
 * No LLM, no parsing of meaning, no writes. `safeFetch` is mandatory rather than
 * `fetch` — it re-resolves and dials the validated IP on every hop, so a source
 * pointed at `http://127.0.0.1` (or a hostname that resolves there a moment
 * later) is refused before a single byte is read, and never reaches the model.
 */
export async function probeUrlPage(
  ctx: ProbeContext<UrlSourceConfig>,
): Promise<ProbeResult<UrlPagePayload>> {
  const config = readUrlSourceConfig(ctx.config);
  const target = parsePublicUrl(config.url);

  const res = await safeFetch(target, {
    headers: { "user-agent": USER_AGENT, accept: "text/html,*/*;q=0.8" },
  });
  assertFetched(res, target.toString());
  if (!res.body) {
    throw new Error(`Page returned no body: ${target.toString()}`);
  }

  const html = await readCappedBody(res.body, MAX_HTML_BYTES);
  const capped = new Response(html, {
    // Carry the content-type through: the rewriter reads the charset off it.
    headers: { "content-type": res.headers.get("content-type") ?? "text/html" },
  });
  const text = await extractVisibleText(capped);

  return {
    fingerprint: fingerprintPageText(text),
    payload: { url: res.url || target.toString(), text },
  };
}
