import { join, resolve, sep } from "node:path";
import { REPO_ROOT } from "@plugins/infra/plugins/paths/server";
import { prototypesDir } from "../../data-dirs";

/**
 * The `_template/` seed, in the repo.
 *
 * The one part of `prototypes/` that is still code: it is reviewed, versioned,
 * and every new prototype is copied from it. `seedTemplate()` copies it into
 * {@link prototypesDir} so an agent's whole gesture — copy the template, edit
 * the copy — happens inside the data dir. In a compiled release `REPO_ROOT`
 * points into the binary's virtual FS, so this path simply won't exist and
 * seeding is skipped.
 */
export const TEMPLATE_SEED_DIR = join(REPO_ROOT, "prototypes", "_template");

/** The template's name once seeded — skipped by the lister, like any `_` dir. */
export const TEMPLATE_DIR_NAME = "_template";

// A prototype ships whatever it references, so the served set is not just code:
// images and a font are part of "self-contained". No `.jsx` — JSX lives inline
// in index.html (see the watcher, and the `prototypes:self-contained` check).
const MIME_BY_EXT: Record<string, string> = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".woff2": "font/woff2",
};

/** Content-Type for a served file, by extension. */
export function contentTypeForPath(path: string): string {
  const dot = path.lastIndexOf(".");
  const ext = dot === -1 ? "" : path.slice(dot).toLowerCase();
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}

/**
 * Resolve `prototypes/<name>/<rel>` to an absolute path, guarding against
 * traversal. Returns `null` if the resolved path escapes {@link prototypesDir}.
 */
export function resolvePrototypeFile(name: string, rel: string): string | null {
  // Read the getter ONCE: the guard below compares against the same root the
  // path was resolved from, so both must come from a single read.
  const root = prototypesDir.path;
  const abs = resolve(root, name, rel);
  // Must stay strictly under the prototypes dir (not the dir itself, and not a
  // sibling whose name is a prefix, e.g. `prototypes-evil`).
  if (abs !== root && !abs.startsWith(root + sep)) {
    return null;
  }
  return abs;
}
