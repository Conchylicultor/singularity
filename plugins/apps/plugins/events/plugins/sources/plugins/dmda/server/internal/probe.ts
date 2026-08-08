import { createHash } from "node:crypto";
import { NonRetryableError } from "@plugins/infra/plugins/jobs/server";
import {
  parsePublicUrl,
  safeFetch,
} from "@plugins/infra/plugins/safe-fetch/server";
import type {
  ProbeContext,
  ProbeResult,
} from "@plugins/apps/plugins/events/plugins/events-core/server";
import { DMDA_ORIGIN, type DmdaSourceConfig } from "../../core";
import { VisitPageSchema, type VisitRow } from "./rows";
import { readDmdaSourceConfig } from "./source-config";

/**
 * The endpoint the site's own page calls. Hardcoded, because this source type
 * IS this site — a URL field would only be a way to point it somewhere it cannot
 * read. Found by rendering the page once headlessly and watching its XHRs; the
 * page itself ships an empty listing container, which is why the generic `url`
 * extractor reads it as a venue with no events.
 */
const ENDPOINT = `${DMDA_ORIGIN}/api/front/visits`;

/**
 * A loop bound, not a page budget: `done` is the site's word and this is what
 * happens if it never says it. Comfortably above the 3 pages the whole catalogue
 * currently takes.
 */
const MAX_PAGES = 25;

/** What `probe` hands `extract`: the full listing, already read. */
export interface DmdaPayload {
  rows: VisitRow[];
}

/**
 * A 4xx is this plugin's own endpoint being wrong (the site moved its API) —
 * terminal, so the source parks with something actionable rather than retrying
 * an identically-failing request three times. 408/429 and 5xx are the server
 * having a moment: a plain throw, which the refresh job retries.
 */
function assertFetched(res: Response, url: URL): void {
  if (res.ok) return;
  const detail = `${res.status} fetching ${url.toString()}`;
  if (
    res.status >= 400 &&
    res.status < 500 &&
    res.status !== 408 &&
    res.status !== 429
  ) {
    throw new NonRetryableError(`Visits API returned ${detail}`);
  }
  throw new Error(`Visits API returned ${detail}`);
}

/**
 * The cache key, over the identity-bearing fields ONLY.
 *
 * Same doctrine as the URL extractor's text fingerprint: never hash anything
 * that churns per request. `picture` is a signed ActiveStorage blob URL and
 * `page`/`city` are query echoes — folding them in would risk reporting
 * "changed" on every tick and paying for a re-extraction each time. Rows are
 * sorted by id so the digest does not depend on the order pages came back in.
 */
function fingerprintRows(rows: VisitRow[]): string {
  const canonical = [...rows]
    .sort((a, b) => a.id - b.id)
    .map((r) => [r.id, r.title, r.date ?? "", r.location ?? "", r.url]);
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

/**
 * The cheap phase: read the whole listing as JSON and fingerprint it.
 *
 * "Cheap" here is three ~3 KB requests, not one — this API paginates, so
 * fetching page 1 alone would fingerprint a sixth of the listing and hand
 * `extract` a partial set. The engine's contract is that `extract` returns the
 * source's FULL current set, so a partial read is data loss, not a smaller
 * answer.
 */
export async function probeDmdaVisits(
  ctx: ProbeContext<DmdaSourceConfig>,
): Promise<ProbeResult<DmdaPayload>> {
  const { kind } = readDmdaSourceConfig(ctx.config);
  const rows: VisitRow[] = [];

  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = parsePublicUrl(
      `${ENDPOINT}?city=all&kind=${encodeURIComponent(kind)}&page=${page}&query=`,
    );
    const res = await safeFetch(url, {
      headers: { accept: "application/json" },
    });
    assertFetched(res, url);

    const parsed = VisitPageSchema.safeParse(await res.json());
    if (!parsed.success) {
      // The site changed its wire shape. Deterministic, so terminal — and loud,
      // because the alternative is a source that quietly reads zero events.
      throw new NonRetryableError(
        `Visits API page ${page} did not match the expected shape: ${parsed.error.message}`,
        { cause: parsed.error },
      );
    }

    rows.push(...parsed.data.visits);
    if (parsed.data.done) {
      return { fingerprint: fingerprintRows(rows), payload: { rows } };
    }
  }

  // Same reasoning as the URL extractor's truncation guard: a listing we did not
  // read to the end must never become a shorter listing. Every event past the
  // cut would be absent from `extract`'s full set, and the engine stamps
  // `disappearedAt` on exactly that.
  throw new NonRetryableError(
    `Visits API never reported done within ${MAX_PAGES} pages — the listing cannot be read whole`,
  );
}
