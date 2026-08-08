/**
 * "Is a browser the one thing that would change this answer?"
 *
 * That question is this plugin's own domain knowledge — it is a property of how
 * bot mitigation works, not of any one caller's HTTP policy — so the predicate
 * lives here rather than in the consumer that escalates on it.
 *
 * Every entry below is deliberately narrow. A guessed vendor header that never
 * fires is dead code that READS like coverage, and a false positive here is
 * worse than a miss: the caller turns it into a terminal error that parks a
 * source, so a wrong "yes" tells the user their healthy site is unreadable.
 */

/** Structural header reader — satisfied by `Response.headers` without naming the
 * DOM `Headers` global (this module is type-checked from targets that withhold
 * `lib.dom`, exactly like `safe-fetch`'s `Bun.BodyInit` note). */
export interface HeaderReader {
  get(name: string): string | null;
}

/** Either a live headers object or an already-flattened record. */
export type HeaderSource = HeaderReader | Record<string, string>;

/** Evidence that the response is a bot challenge rather than the page. */
export interface BotMitigation {
  /**
   * The header we LITERALLY saw, `name: value`, quoted verbatim into the
   * user-facing message. Never a vendor we inferred from it — "Vercel" is our
   * reading of `x-vercel-mitigated`, and if that reading is wrong the user can
   * still act on the raw fact.
   */
  signal: string;
}

/**
 * Headers whose mere presence on a refusal IS the mitigation statement — the
 * origin is telling us it withheld the page on purpose.
 *
 * `x-vercel-mitigated` is the only one **verified** here (shotgun.live answers
 * every plain request with `429 x-vercel-mitigated: challenge`). `cf-mitigated`
 * is vendor-documented but has not been observed by us; it is included because
 * it is a documented contract, not a guess at one.
 */
const MITIGATION_HEADERS = ["x-vercel-mitigated", "cf-mitigated"] as const;

/** Statuses on which a named mitigation header is believable. */
const NAMED_STATUSES = new Set([403, 429, 503]);

/**
 * Statuses on which the Cloudflare *shape* (`server: cloudflare` + `cf-ray`,
 * with no mitigation header) is believable. Deliberately **excludes 503**: a
 * Cloudflare 503 is just as likely an origin outage, and calling that terminal
 * would park a healthy source through a blip.
 */
const SHAPE_STATUSES = new Set([403, 429]);

function readHeader(source: HeaderSource, name: string): string | null {
  if (typeof (source as HeaderReader).get === "function") {
    return (source as HeaderReader).get(name);
  }
  const record = source as Record<string, string>;
  const direct = record[name];
  if (direct !== undefined) return direct;
  // A hand-built record may carry original casing; HTTP header names are
  // case-insensitive, so a miss on the lowercase key is not an answer yet.
  for (const [key, value] of Object.entries(record)) {
    if (key.toLowerCase() === name) return value;
  }
  return null;
}

/**
 * Classify a response as bot mitigation, or `null` for "this is an ordinary
 * response" — a predicate's two legitimate answers, not an absorbed failure.
 *
 * Three refusals are load-bearing and must not be relaxed:
 *
 * - **Never fires on a 2xx.** A readable page that happens to carry the header
 *   is still readable; escalating on it would trade a working answer for a 4 s
 *   browser launch and, worse, make the caller's content fingerprint bistable.
 * - **A bare 429 with no evidence is not mitigation.** That is the real
 *   rate-limit case, and it must keep retrying — it will succeed later.
 * - **No body sniffing** ("Just a moment…"). It is impure, locale-dependent,
 *   and it would force reading a body the caller currently cancels.
 */
export function detectBotMitigation(
  status: number,
  headers: HeaderSource,
): BotMitigation | null {
  if (NAMED_STATUSES.has(status)) {
    for (const name of MITIGATION_HEADERS) {
      const value = readHeader(headers, name);
      if (value !== null && value !== "") {
        return { signal: `${name}: ${value}` };
      }
    }
  }

  // Inference, not a statement: Cloudflare fronts an enormous number of healthy
  // origins, so this branch rests on the *pair* (its own server banner plus a
  // ray id) on a status Cloudflare itself uses for its challenge pages.
  if (SHAPE_STATUSES.has(status)) {
    const server = readHeader(headers, "server");
    const ray = readHeader(headers, "cf-ray");
    if (server?.toLowerCase() === "cloudflare" && ray !== null && ray !== "") {
      return { signal: `server: cloudflare, cf-ray: ${ray}` };
    }
  }

  return null;
}
