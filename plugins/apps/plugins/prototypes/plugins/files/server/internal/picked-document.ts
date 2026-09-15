import {
  picksFromQuery,
  readPrototypeOptions,
  type OptionPicks,
} from "../../core";

// Option picks on a served document — shared by the live file route and the
// version file route, so a past version is switchable exactly like the live
// page, judged against its OWN declaration.

/** Does the query carry anything besides the `v` cache-bust? */
export function hasPicks(search: URLSearchParams): boolean {
  for (const key of search.keys()) if (key !== "v") return true;
  return false;
}

/**
 * The prototype's document with the picked option values stamped onto its
 * `<html>` as `data-<option>="<value>"`, overwriting the defaults the author
 * wrote there. Nothing else in the page changes, so the page needs no code of
 * its own to be switchable: its CSS keys on `:root[data-<option>=…]`, its JS
 * reads `document.documentElement.dataset`.
 *
 * The text is read whole first because `<html>` streams before the `<meta>`
 * tags that say which picks are valid (prototype HTML is small). The picks are
 * judged against THIS document's declaration — for a recorded version, the
 * options it declared, not today's. A pick the page does not declare is a 400,
 * rendered inside the frame: a broken link must say so rather than show the
 * default and let the reader believe they are looking at the variant they
 * asked for.
 *
 * The one HTMLRewriter REWRITE in the repo — every other use only extracts.
 */
export async function servePickedDocument(
  html: string,
  search: URLSearchParams,
  headers: Record<string, string>,
): Promise<Response> {
  const { options } = await readPrototypeOptions(html);
  const result = picksFromQuery(options, search);
  if (!result.ok) {
    return new Response(
      `Cannot show this prototype variant: ${result.reason}.`,
      {
        status: 400,
        headers: { "content-type": "text/plain; charset=utf-8" },
      },
    );
  }
  return new Response(await stampPicks(html, result.picks), { headers });
}

async function stampPicks(html: string, picks: OptionPicks): Promise<string> {
  let stamped = false;
  const rewriter = new HTMLRewriter().on("html", {
    element(el) {
      if (stamped) return;
      stamped = true;
      // Names and values are already validated against the declaration, which
      // only admits [a-z0-9-] — nothing here can break out of the attribute.
      for (const [option, value] of Object.entries(picks)) {
        el.setAttribute(`data-${option}`, value);
      }
    },
  });
  return rewriter.transform(new Response(html)).text();
}
