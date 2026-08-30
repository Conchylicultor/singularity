/**
 * Calling the app's own API from an e2e script's Node side, with provenance.
 *
 * `withBrowser` stamps the agent-origin headers on the browser CONTEXT, which
 * covers every request the page issues — including the SPA's own `fetch` calls.
 * It does not, and cannot, cover a request the script makes itself from Node.
 *
 * That gap matters because the mark is what makes a write attributable and
 * undoable: a page a script creates through a bare `fetch` is never swept, and
 * a config document it writes through one is invisible to the revert ledger and
 * stays changed in the user's config forever. The script still goes green.
 *
 * So route Node-side calls to the app through here. `no-unmarked-app-fetch`
 * enforces it.
 */
import { agentOriginHeaders } from "@plugins/infra/plugins/request-origin/core";
import { basename } from "node:path";
import { pathUrl } from "./target";

/**
 * The running script, as a provenance label — the same derivation
 * `withBrowser` uses for the browser context, so a run's Node-side and
 * browser-side writes carry one identity rather than two.
 */
function originSource(): string {
  const entry = process.argv[1];
  if (!entry) return "e2e";
  return `e2e:${basename(entry).replace(/\.[tj]sx?$/, "")}`;
}

/**
 * `fetch` against the app under test, marked as agent-caused.
 *
 * `path` is app-relative (`/api/pages/…`); the target comes from `baseUrl()`,
 * so a script honours `--base` without restating it. Caller-supplied headers
 * win over nothing — the provenance headers are applied last, deliberately, so
 * a script cannot accidentally unmark itself by spreading a header object.
 */
export function agentFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  return fetch(pathUrl(path), {
    ...init,
    headers: { ...init.headers, ...agentOriginHeaders(originSource()) },
  });
}
