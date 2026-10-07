import { z } from "zod";
import { statusFromOembedCode, type CodeVerdict } from "../../core";

/**
 * Longest one oEmbed check may take. A normal answer takes ~80 ms; this only
 * bounds a YouTube that has stopped answering, so a caller never waits on it
 * for long.
 */
const VIDEO_CHECK_TIMEOUT_MS = 2_000;

/** The two fields of oEmbed's 200 body anything reads. */
const OembedBodySchema = z.object({
  title: z.string(),
  author_name: z.string(),
});

/** What a 200 said the video is called, or why that could not be read. */
export type OembedMeta =
  | { kind: "read"; title: string; channel: string }
  | { kind: "unreadable"; reason: string };

/** What one oEmbed request came back with. */
export type OembedCheck =
  /**
   * YouTube answered. `verdict` is `undecided` for a code that says nothing
   * about the video. `meta` is present on a 200 only: the video's title and
   * channel as oEmbed names them.
   */
  | {
      kind: "answered";
      code: number;
      verdict: CodeVerdict;
      meta: OembedMeta | null;
    }
  /** No answer: the request failed or timed out. Nothing is known. */
  | { kind: "unreachable"; reason: string };

async function readMeta(res: Response): Promise<OembedMeta> {
  let body: unknown;
  try {
    body = await res.json();
  } catch (err) {
    // A 200 whose body is not JSON still says the video is there; only its
    // name is unknown, and the caller sees why.
    return {
      kind: "unreadable",
      reason: err instanceof Error ? err.message : String(err),
    };
  }
  const parsed = OembedBodySchema.safeParse(body);
  return parsed.success
    ? {
        kind: "read",
        title: parsed.data.title,
        channel: parsed.data.author_name,
      }
    : { kind: "unreadable", reason: parsed.error.message };
}

/**
 * Ask YouTube's oEmbed endpoint about one video: the HTTP status says whether
 * it plays in an embed (`statusFromOembedCode`), and a 200's body names it.
 *
 * oEmbed, never the watch page: ~1,000 oEmbed requests with up to 12 in flight
 * drew no 429 and no slow-down, where scraping watch pages got this machine a
 * `google.com/sorry` captcha after about a hundred.
 *
 * Plain `fetch` on purpose: `@plugins/infra/plugins/safe-fetch` exists to guard
 * URLs a USER supplied (SSRF), and `www.youtube.com` is a fixed host we wrote
 * into the code — the video id only ever lands in a query parameter. Routing
 * this through safeFetch would buy nothing — do not "fix" it later.
 */
export async function checkOembed(videoId: string): Promise<OembedCheck> {
  const url = new URL("https://www.youtube.com/oembed");
  url.searchParams.set("url", `https://www.youtube.com/watch?v=${videoId}`);
  url.searchParams.set("format", "json");

  let res: Response;
  try {
    res = await fetch(url, {
      signal: AbortSignal.timeout(VIDEO_CHECK_TIMEOUT_MS),
    });
  } catch (err) {
    // Only the request itself is inside this try, and everything it can throw
    // (DNS, refused connection, TLS, the timeout's abort) means the same thing:
    // YouTube gave no answer. It is returned as a result the caller decides
    // on (the chord trainer offers the video anyway), never swallowed.
    return {
      kind: "unreachable",
      reason:
        err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    };
  }
  let meta: OembedMeta | null = null;
  if (res.status === 200) meta = await readMeta(res);
  else await res.body?.cancel();
  return {
    kind: "answered",
    code: res.status,
    verdict: statusFromOembedCode(res.status),
    meta,
  };
}
