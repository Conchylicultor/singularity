import { implement } from "@plugins/infra/plugins/endpoints/server";
import {
  PROTOTYPES_API_BASE,
  PROTOTYPE_ENTRY_FILE,
  createPrototype,
  listPrototypes,
  picksFromQuery,
  readPrototypeOptions,
  type OptionPicks,
} from "../../core";
import { HISTORY_DIR_NAME } from "../../shared/history/store";
import { mintPrototype } from "../../shared/mint";
import { listPrototypeMetas } from "./list";
import { contentTypeForPath, resolvePrototypeFile } from "./paths";

/** `GET /api/prototypes` → the prototype list (JSON, via implement()). */
export const handleList = implement(listPrototypes, async () => {
  return listPrototypeMetas();
});

/**
 * `POST /api/prototypes` → mint a prototype, answer with its id.
 *
 * No list notification here: the mint writes a folder into the watched tree, so
 * the same file watcher that reacts to an agent's edit is what re-broadcasts the
 * list. One signal for "the tree moved", not two.
 */
export const handleCreate = implement(createPrototype, async ({ body }) => {
  const { id } = await mintPrototype({ title: body.title });
  return { id };
});

/**
 * `GET /api/prototypes/:name` → 302 to `…/:name/index.html`, carrying the query
 * (`?v=`) across.
 *
 * The folder-shaped URL is the real one — it is what makes a relative
 * `href="styles.css"` inside the document resolve to that prototype's own file.
 * This bare form exists only so a hand-typed or older URL still lands somewhere
 * sensible.
 */
export function handlePrototypeFile(
  req: Request,
  params: Record<string, string>,
): Response {
  const name = params.name;
  if (!name) return new Response("missing name", { status: 400 });
  if (name === HISTORY_DIR_NAME) return historyNotServed();

  const { search } = new URL(req.url);
  const location = `${PROTOTYPES_API_BASE}/${encodeURIComponent(name)}/index.html${search}`;
  return new Response(null, { status: 302, headers: { location } });
}

/**
 * `GET /api/prototypes/:name/:file` → `prototypes/<name>/<file>` verbatim, with
 * a Content-Type by extension — except that `index.html` asked for with option
 * picks (`?palette=azure`) comes back with them stamped onto `<html>`; see
 * {@link servePickedDocument}.
 *
 * `Cache-Control: no-store` is load-bearing: the version query only cache-busts
 * the document, so without it the browser would keep serving the previously
 * fetched `styles.css` and an agent's edit would appear not to have landed.
 *
 * Path-traversal guard: the resolved absolute path must stay under
 * `prototypes/`; otherwise 400. Missing files → 404.
 */
export async function handlePrototypeAsset(
  req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const name = params.name;
  const fileName = params.file;
  if (!name || !fileName) return new Response("missing name", { status: 400 });
  if (name === HISTORY_DIR_NAME) return historyNotServed();

  const abs = resolvePrototypeFile(name, fileName);
  if (abs === null) {
    return new Response("invalid path", { status: 400 });
  }

  const file = Bun.file(abs);
  if (!(await file.exists())) {
    return new Response("not found", { status: 404 });
  }

  const headers = {
    "content-type": contentTypeForPath(fileName),
    "cache-control": "no-store",
  };
  const search = new URL(req.url).searchParams;
  if (fileName === PROTOTYPE_ENTRY_FILE && hasPicks(search)) {
    return servePickedDocument(await file.text(), search, headers);
  }
  return new Response(file, { headers });
}

/**
 * `_history/` sits in the served tree beside the prototypes, and holds each
 * one's private git repo. Its internals are never served — a version's files
 * are, through the versions route, which reads them out of git.
 */
function historyNotServed(): Response {
  return new Response("not found", { status: 404 });
}

/** Does the query carry anything besides the `v` cache-bust? */
function hasPicks(search: URLSearchParams): boolean {
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
 * tags that say which picks are valid (prototype HTML is small). A pick the
 * page does not declare is a 400, rendered inside the frame: a broken link must
 * say so rather than show the default and let the reader believe they are
 * looking at the variant they asked for.
 *
 * The one HTMLRewriter REWRITE in the repo — every other use only extracts.
 */
async function servePickedDocument(
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
