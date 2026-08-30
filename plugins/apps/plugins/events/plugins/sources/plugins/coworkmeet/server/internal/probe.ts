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
import type { CoworkmeetSourceConfig } from "../../core";
import { registrationCount, SessionPageSchema, type SessionRow } from "./rows";
import { readCoworkmeetSourceConfig } from "./source-config";

/**
 * The association's own database, read through PostgREST — the same call its
 * site makes from the browser. Hardcoded, because this source type IS this
 * association: a URL field would only be a way to point it at something it
 * cannot read. The site's listing is rendered client-side from this call, which
 * is why the generic `url` type reads its page as a venue with no events.
 */
const ENDPOINT =
  "https://zouzqrendnialuqtmorh.supabase.co/rest/v1/coworking_sessions";

/**
 * The site's own Supabase **anon** key, shipped in its browser bundle.
 *
 * A public credential, not a secret: it identifies the project and nothing else,
 * and what it may read is decided by Postgres row-level security on the far
 * side. Every visitor to coworkmeet.fr sends this exact string. So it is
 * hardcoded here, exactly as `dmda` hardcodes its endpoint, rather than routed
 * through the secrets store — which would imply a per-user value that does not
 * exist.
 */
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvdXpxcmVuZG5pYWx1cXRtb3JoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg4Nzk1NDAsImV4cCI6MjA3NDQ1NTU0MH0.q7A52pHimbL9Vz2hx-NJ8vc7l00dfLc0zaRN3FZON1Q";

/**
 * The columns this type maps, plus the registration count as a PostgREST
 * embedded aggregate.
 *
 * `latitude` / `longitude` are published and deliberately not read: an extracted
 * event has no geo field, and a column fetched for nobody is a thing the next
 * reader has to work out the purpose of.
 */
const SELECT = [
  "id",
  "nom_lieu",
  "adresse_lieu",
  "date_session",
  "heure_debut",
  "heure_fin",
  "photo_url",
  "note_lieu",
  "description_session",
  "max_participants",
  "prix_conso",
  "referent_name",
  "niveau_calme",
  "ambiance",
  "disponibilite_prises",
  "event_type",
  "arrondissement",
  "session_registrations(count)",
].join(",");

/**
 * The three flags that mean something about the session itself: it is published,
 * it has not been deleted, it has not been cancelled.
 *
 * The table also has `archived`, and the site's own listing filters on it. This
 * one does NOT, on purpose — see the plugin's `CLAUDE.md`. `archived` is applied
 * as housekeeping rather than as a statement about the session (the 2025
 * sessions are archived while dozens of already-past 2026 ones are not), so
 * filtering on it would let an upstream tidying sweep delete previously
 * published events out of our own listing, and the engine would stamp
 * `disappearedAt` on every one of them.
 */
const FILTERS = "published=eq.true&deleted=eq.false&cancelled=eq.false";

/** PostgREST pages; this is the page size, comfortably above the whole live set. */
const PAGE_SIZE = 200;

/**
 * A loop bound, not a page budget: `Content-Range` is the association's word for
 * how many sessions there are and this is what happens if reading them never
 * reaches it. 5000 sessions is two orders of magnitude above the live listing.
 */
const MAX_PAGES = 25;

/** `Content-Range: 0-66/67` — the range served, then the total. */
const CONTENT_RANGE = /^\s*(?:\d+-\d+|\*)\/(\d+)\s*$/;

/** What `probe` hands `extract`: the full listing, already read. */
export interface CoworkmeetPayload {
  rows: SessionRow[];
}

/**
 * A 4xx is this plugin's own request being wrong (the table moved, the anon key
 * was rotated, RLS closed the door) — terminal, so the source parks with
 * something actionable rather than retrying an identically-failing request.
 * 408/429 and 5xx are the server having a moment: a plain throw, which the
 * refresh job retries.
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
    throw new NonRetryableError(`Sessions API returned ${detail}`);
  }
  throw new Error(`Sessions API returned ${detail}`);
}

/**
 * How many sessions there are in total, from the header `Prefer: count=exact`
 * asks for.
 *
 * Terminal when it is missing or is PostgREST's `*` (count not computed): the
 * total is the only thing that says the listing was read WHOLE, and without it
 * the loop could only guess from a short page — which is the guess that turns a
 * truncated read into mass `disappearedAt`.
 */
function totalFrom(res: Response, url: URL): number {
  const header = res.headers.get("content-range");
  const match = header === null ? null : CONTENT_RANGE.exec(header);
  if (match === null) {
    throw new NonRetryableError(
      `Sessions API gave no exact Content-Range total (got ${JSON.stringify(header)}) fetching ${url.toString()} — the listing cannot be read whole`,
    );
  }
  return Number(match[1]);
}

/**
 * The cache key, over every field this plugin reads — the registration count
 * included.
 *
 * Conservative on purpose, and the opposite call from `dmda`, which hashes
 * identity fields only. Two reasons this one can afford it:
 *
 *  - **Nothing here churns per request.** `dmda`'s `picture` is a signed blob URL
 *    that changes on every fetch, so folding it in would defeat the cache
 *    outright. These are plain columns; they change when a human edits a session.
 *  - **`extract` costs no model call.** A false "changed" buys a few milliseconds
 *    of mapping and a re-upsert of identical rows, while a false "unchanged"
 *    hides a real edit — a venue's note, a price, one more person signed up —
 *    until something else about the listing moves. Cheap re-extraction against
 *    invisible staleness is not a close call.
 *
 * Sorted by id so the digest does not depend on the order the pages came back in.
 */
function fingerprintRows(rows: readonly SessionRow[]): string {
  const canonical = [...rows]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((r) => [
      r.id,
      r.nom_lieu,
      r.adresse_lieu,
      r.date_session,
      r.heure_debut,
      r.heure_fin,
      r.photo_url,
      r.note_lieu,
      r.description_session,
      r.max_participants,
      r.prix_conso,
      r.referent_name,
      r.niveau_calme,
      r.ambiance,
      r.disponibilite_prises,
      r.event_type,
      r.arrondissement,
      registrationCount(r) ?? null,
    ]);
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

/**
 * The cheap phase: read the whole published listing as JSON and fingerprint it.
 *
 * "Cheap" is one request for the live set, but the loop is not optional: the
 * engine's contract is that `extract` returns the source's FULL current set, so
 * a partial read is data loss rather than a smaller answer.
 */
export async function probeCoworkmeetSessions(
  ctx: ProbeContext<CoworkmeetSourceConfig>,
): Promise<ProbeResult<CoworkmeetPayload>> {
  // Read for its failure, not its value: a row whose stored config no longer
  // fits must park HERE, before a request goes out.
  readCoworkmeetSourceConfig(ctx.config);

  const rows: SessionRow[] = [];
  let total: number | undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    const url = parsePublicUrl(
      `${ENDPOINT}?select=${encodeURIComponent(SELECT)}&${FILTERS}` +
        `&order=date_session.asc&limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`,
    );
    const res = await safeFetch(url, {
      headers: {
        accept: "application/json",
        // Both, as the site sends them: `apikey` is what the Supabase gateway
        // routes on, `Authorization` is what PostgREST reads the `anon` role out
        // of. Sending one alone is a 401.
        apikey: ANON_KEY,
        authorization: `Bearer ${ANON_KEY}`,
        prefer: "count=exact",
      },
    });
    assertFetched(res, url);
    total = totalFrom(res, url);

    const parsed = SessionPageSchema.safeParse(await res.json());
    if (!parsed.success) {
      // The association changed its wire shape. Deterministic, so terminal — and
      // loud, because the alternative is a source that quietly reads zero
      // sessions.
      throw new NonRetryableError(
        `Sessions API page ${page} did not match the expected shape: ${parsed.error.message}`,
        { cause: parsed.error },
      );
    }

    rows.push(...parsed.data);
    if (rows.length >= total) {
      return { fingerprint: fingerprintRows(rows), payload: { rows } };
    }
    if (parsed.data.length === 0) {
      // The total says there is more and the page served nothing: the listing
      // moved under the read (a delete between pages) or the API stopped
      // honouring `offset`. Either way what we hold is not the whole set.
      throw new NonRetryableError(
        `Sessions API served an empty page ${page} with ${rows.length} of ${total} sessions read — the listing cannot be read whole`,
      );
    }
  }

  // A listing we did not read to the end must never become a shorter listing.
  // Every session past the cut would be absent from `extract`'s full set, and
  // the engine stamps `disappearedAt` on exactly that.
  throw new NonRetryableError(
    `Sessions API served only ${rows.length} of ${total ?? "?"} sessions within ${MAX_PAGES} pages — the listing cannot be read whole`,
  );
}
