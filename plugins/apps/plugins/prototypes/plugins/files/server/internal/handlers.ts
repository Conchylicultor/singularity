import { join } from "node:path";
import { implement } from "@plugins/infra/plugins/endpoints/server";
import { listPrototypes } from "../../core";
import { listPrototypeMetas } from "./list";
import {
  PROTOTYPES_DIR,
  contentTypeForPath,
  resolvePrototypeFile,
} from "./paths";

/** `GET /api/prototypes` → the prototype list (JSON, via implement()). */
export const handleList = implement(listPrototypes, async () => {
  return listPrototypeMetas();
});

const HARNESS_PATH = join(PROTOTYPES_DIR, "_shared", "harness.html");

/**
 * `GET /api/prototypes/:name` — serves prototype files.
 *
 * - No `path` query → the shared harness (`_shared/harness.html`), verbatim, as
 *   text/html. The harness derives the prototype name from its own URL.
 * - `?path=<rel>` → `prototypes/<name>/<rel>` (pseudo-name `_shared` →
 *   `prototypes/_shared/<rel>`), Content-Type by extension.
 *
 * Path-traversal guard: the resolved absolute path must stay under
 * `prototypes/`; otherwise 400. Missing files → 404.
 *
 * The router has no wildcard/splat support and matches `:name` as an exact
 * single segment, which is why sub-paths come through the `?path=` query.
 */
export async function handlePrototypeFile(
  req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const name = params.name;
  if (!name) return new Response("missing name", { status: 400 });

  const path = new URL(req.url).searchParams.get("path");

  if (path === null) {
    // Serve the shared harness verbatim.
    const file = Bun.file(HARNESS_PATH);
    if (!(await file.exists())) {
      return new Response("harness not found", { status: 404 });
    }
    return new Response(file, { headers: { "content-type": "text/html" } });
  }

  const abs = resolvePrototypeFile(name, path);
  if (abs === null) {
    return new Response("invalid path", { status: 400 });
  }

  const file = Bun.file(abs);
  if (!(await file.exists())) {
    return new Response("not found", { status: 404 });
  }

  return new Response(file, {
    headers: { "content-type": contentTypeForPath(path) },
  });
}
