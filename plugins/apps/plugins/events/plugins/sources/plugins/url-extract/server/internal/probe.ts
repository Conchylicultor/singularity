import { NonRetryableError } from "@plugins/infra/plugins/jobs/server";
import { parsePublicUrl, safeFetch } from "@plugins/infra/plugins/safe-fetch/server";
import type { ProbeContext, ProbeResult } from "@plugins/apps/plugins/events/plugins/events-core/server";
import type { UrlSourceConfig } from "../../core";
import { simplifyPageHtml } from "./page-html";
import { extractVisibleText, fingerprintPageText } from "./page-text";
import { readUrlSourceConfig } from "./source-config";

/**
 * A DoS backstop, NOT a content bound: it exists so a URL that turns out to
 * point at a multi-gigabyte file costs a bounded read, and nothing else.
 *
 * It is deliberately far larger than any page's readable text, because a byte
 * offset says nothing about where the content is. The 256 KB this used to be
 * silently cut `fitzroy-paris.com` at byte 262,144 — still 440 KB short of
 * `<body>`, behind ~676 KB of inline Wix `<style>` — so the model was handed the
 * `<title>` alone and correctly answered "no events". The real bound is
 * `MAX_TEXT_CHARS` below.
 */
const MAX_HTML_BYTES = 8 * 1024 * 1024;

/**
 * The bound that actually means something: how much visible text is read.
 * 200k characters is far beyond any real listing page — a page over it is a
 * sign the URL is wrong (an archive, a full-site dump), not a venue's what's-on.
 */
const MAX_TEXT_CHARS = 200_000;

/**
 * The same bound for the simplified markup the model reads, which carries tag
 * overhead on top of the text. Generous — this page reduces 1.25 MB to ~4 KB —
 * and it exists so a pathological tree cannot outgrow the model's context.
 */
const MAX_MODEL_HTML_CHARS = 400_000;

const USER_AGENT =
  "Mozilla/5.0 (compatible; SingularityBot/1.0; +events-extractor)";

/**
 * What `probe` hands `extract`: the page already read, so the expensive phase
 * costs no second fetch.
 *
 * TWO renderings of the same bytes, for two different jobs — do not collapse
 * them into one. `text` is the cheapest stable reading of the page and is what
 * the fingerprint is taken over; `html` keeps the element tree, which is the
 * only thing that says which title, date and venue belong to the SAME event.
 * Fingerprinting `html` instead would fold every attribute's per-request churn
 * into the cache key for no gain.
 */
export interface UrlPagePayload {
  /** The URL after redirects — what the model is told it is reading. */
  url: string;
  /** The normalized visible text the fingerprint was taken over. */
  text: string;
  /** The simplified element tree — what the model actually reads. */
  html: string;
}

/**
 * The bytes of a capped read, and whether the body had more.
 *
 * `truncated` is reported rather than swallowed because truncated markup parses
 * perfectly well — the rewriter just stops mid-document — so a partial page is
 * silent by default, and a silently partial page is the one failure mode that
 * makes the engine delete the user's events.
 */
export interface CappedBody {
  bytes: Uint8Array<ArrayBuffer>;
  /** True when the body had MORE than `max` bytes: what we hold is partial. */
  truncated: boolean;
}

/**
 * Read at most `max` bytes of the body, then cancel the download.
 *
 * A real bound, not a counter consulted after the fact: the reader is cancelled
 * the moment we have enough, so a URL that turns out to point at a
 * multi-gigabyte file costs `max`.
 *
 * The budget is `max + 1` so that "filled the cap" and "ended exactly at the
 * cap" are distinguishable — without the extra byte, a body that happens to be
 * exactly `max` long is indistinguishable from one that was cut, and the flag
 * would have to guess.
 *
 * Read into bytes rather than piped through a capping `TransformStream` because
 * Bun's `HTMLRewriter.transform()` cannot consume a `Response` whose body is a
 * JS `TransformStream` (`ERR_STREAM_CANNOT_PIPE`, Bun 1.3.13).
 */
export async function readCappedBody(
  body: ReadableStream<Uint8Array>,
  max: number,
): Promise<CappedBody> {
  const budget = max + 1;
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let seen = 0;
  try {
    while (seen < budget) {
      const { done, value } = await reader.read();
      if (done) break;
      const room = budget - seen;
      const slice = value.byteLength <= room ? value : value.subarray(0, room);
      chunks.push(slice);
      seen += slice.byteLength;
    }
  } finally {
    await reader.cancel();
  }

  const truncated = seen > max;
  const length = truncated ? max : seen;
  const out = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    if (offset >= length) break;
    const slice = chunk.subarray(0, Math.min(chunk.byteLength, length - offset));
    out.set(slice, offset);
    offset += slice.byteLength;
  }
  return { bytes: out, truncated };
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

  const body = await readCappedBody(res.body, MAX_HTML_BYTES);
  assertWhole(
    body.truncated,
    `is larger than the ${MAX_HTML_BYTES / 1024 / 1024} MB markup ceiling`,
    target,
  );

  // Carry the content-type through: both readers take the charset off it.
  const contentType = res.headers.get("content-type") ?? "text/html";
  const asResponse = (): Response =>
    new Response(body.bytes, { headers: { "content-type": contentType } });

  const page = await extractVisibleText(asResponse(), MAX_TEXT_CHARS);
  assertWhole(
    page.truncated,
    `has more than ${MAX_TEXT_CHARS} characters of visible text`,
    target,
  );

  const html = simplifyPageHtml(await asResponse().text());
  assertWhole(
    html.length > MAX_MODEL_HTML_CHARS,
    `simplifies to more than ${MAX_MODEL_HTML_CHARS} characters of markup`,
    target,
  );

  return {
    // Over the TEXT, never the markup — see `UrlPagePayload`.
    fingerprint: fingerprintPageText(page.text),
    payload: { url: res.url || target.toString(), text: page.text, html },
  };
}

/**
 * A page we could not read WHOLE is a failure, never a shorter page.
 *
 * Continuing with the part we have is the tempting option and the destructive
 * one: the model reads a fragment, returns however many events happen to be in
 * it — often none — and `runSource` then stamps `disappearedAt` on every event
 * this source ever found, because "extracted nothing" is exactly how the engine
 * is told a listing has emptied. `parse-response.ts` refuses to return `[]` for
 * this reason, but a truncated *page* routes around that guard: the model's `[]`
 * is a truthful answer to what it was shown.
 *
 * Terminal rather than transient, on the same reasoning as a 4xx: the identical
 * request truncates identically forever, so retrying it three times buys nothing
 * and the source should park with something a human can act on (fix the URL, or
 * raise the ceiling deliberately).
 */
function assertWhole(truncated: boolean, why: string, target: URL): void {
  if (!truncated) return;
  throw new NonRetryableError(`Page ${why} and cannot be read whole: ${target.toString()}`);
}
