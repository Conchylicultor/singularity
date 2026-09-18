import { statusFromOembedCode, type CodeVerdict } from "../../core";

/**
 * Longest one oEmbed check may take. A normal answer takes ~80 ms; this only
 * bounds a YouTube that has stopped answering, so a loop query never waits on
 * it for long.
 */
const VIDEO_CHECK_TIMEOUT_MS = 2_000;

/** What one oEmbed request came back with. */
export type OembedCheck =
  /** YouTube answered. `verdict` is `undecided` for a code that says nothing about the video. */
  | { kind: "answered"; code: number; verdict: CodeVerdict }
  /** No answer: the request failed or timed out. Nothing is known, and nothing is recorded. */
  | { kind: "unreachable"; reason: string };

/**
 * Ask YouTube's oEmbed endpoint about one video. Only the HTTP status matters;
 * the body is discarded unread.
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
    // YouTube gave no answer. That must not fail the loop query — an
    // unreachable YouTube must never empty the trainer — so it is returned as
    // a result the caller logs, never swallowed.
    return {
      kind: "unreachable",
      reason:
        err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    };
  }
  await res.body?.cancel();
  return {
    kind: "answered",
    code: res.status,
    verdict: statusFromOembedCode(res.status),
  };
}
