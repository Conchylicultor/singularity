import { UgFetchError } from "./errors";

/**
 * Resolve a pasted Ultimate Guitar tab URL to its numeric tab id.
 *
 * UG tab URLs carry the id in one of a few shapes:
 *  - trailing hyphen segment: `…/tab/ed-sheeran/perfect-chords-1956589`
 *  - bare numeric path:        `…/tab/3250376`
 *  - query param:              `…?id=12345`
 *
 * The host must be (a subdomain of) `ultimate-guitar.com`; any other host or an
 * unparseable / id-less URL is rejected with `UgFetchError{kind:"invalid-url"}`.
 */
export function extractUgTabId(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch (err) {
    if (!(err instanceof TypeError)) throw err;
    throw new UgFetchError(
      "invalid-url",
      `Not a valid URL: ${JSON.stringify(url)}`,
      { cause: err },
    );
  }

  const host = parsed.hostname.toLowerCase();
  if (host !== "ultimate-guitar.com" && !host.endsWith(".ultimate-guitar.com")) {
    throw new UgFetchError(
      "invalid-url",
      `Not an Ultimate Guitar URL (host: ${parsed.hostname}).`,
    );
  }

  // Explicit ?id=<digits> wins.
  const idParam = parsed.searchParams.get("id");
  if (idParam && /^\d+$/.test(idParam)) return idParam;

  const path = parsed.pathname.replace(/\/+$/, "");

  // `/tab/3250376` — bare numeric path.
  const bare = path.match(/\/tab\/(\d+)$/);
  if (bare?.[1]) return bare[1];

  // `…-1956589` — trailing hyphen segment id.
  const trailing = path.match(/-(\d+)$/);
  if (trailing?.[1]) return trailing[1];

  throw new UgFetchError(
    "invalid-url",
    `Could not find a tab id in Ultimate Guitar URL: ${JSON.stringify(url)}`,
  );
}
