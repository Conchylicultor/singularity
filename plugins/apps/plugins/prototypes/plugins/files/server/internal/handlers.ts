import { implement } from "@plugins/infra/plugins/endpoints/server";
import { PROTOTYPES_API_BASE, listPrototypes } from "../../core";
import { listPrototypeMetas } from "./list";
import { contentTypeForPath, resolvePrototypeFile } from "./paths";

/** `GET /api/prototypes` → the prototype list (JSON, via implement()). */
export const handleList = implement(listPrototypes, async () => {
  return listPrototypeMetas();
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

  const { search } = new URL(req.url);
  const location = `${PROTOTYPES_API_BASE}/${encodeURIComponent(name)}/index.html${search}`;
  return new Response(null, { status: 302, headers: { location } });
}

/**
 * `GET /api/prototypes/:name/:file` → `prototypes/<name>/<file>` verbatim, with
 * a Content-Type by extension.
 *
 * `Cache-Control: no-store` is load-bearing: the version query only cache-busts
 * the document, so without it the browser would keep serving the previously
 * fetched `styles.css` and an agent's edit would appear not to have landed.
 *
 * Path-traversal guard: the resolved absolute path must stay under
 * `prototypes/`; otherwise 400. Missing files → 404.
 */
export async function handlePrototypeAsset(
  _req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const name = params.name;
  const fileName = params.file;
  if (!name || !fileName) return new Response("missing name", { status: 400 });

  const abs = resolvePrototypeFile(name, fileName);
  if (abs === null) {
    return new Response("invalid path", { status: 400 });
  }

  const file = Bun.file(abs);
  if (!(await file.exists())) {
    return new Response("not found", { status: 404 });
  }

  return new Response(file, {
    headers: {
      "content-type": contentTypeForPath(fileName),
      "cache-control": "no-store",
    },
  });
}
