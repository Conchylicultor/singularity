import { COWORKMEET_ORIGIN } from "../../core";

/**
 * The association's own site — the human face of the listing this type reads.
 *
 * It does not vary with the source's config, and that is a fact about the site
 * rather than an omission here: its listing is rendered client-side from one
 * unfiltered query, with no URL grammar for districts, ambiance, noise or
 * sockets. Inventing query parameters it does not read would produce a link that
 * silently shows something other than what the source tracks.
 *
 * The `config` argument is the slot's contract, kept so a future filter grammar
 * on the site is a change to this file alone.
 */
export function coworkmeetSourceOriginUrl(
  _config: Record<string, unknown>,
): string {
  return `${COWORKMEET_ORIGIN}/`;
}
