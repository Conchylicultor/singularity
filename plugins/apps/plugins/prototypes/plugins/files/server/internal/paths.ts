import { join, resolve, sep } from "node:path";
import { REPO_ROOT } from "@plugins/infra/plugins/paths/server";

/** Repo-root `prototypes/` directory — the only tree this plugin serves. */
export const PROTOTYPES_DIR = join(REPO_ROOT, "prototypes");

const MIME_BY_EXT: Record<string, string> = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".jsx": "text/javascript",
  ".json": "application/json",
};

/** Content-Type for a served file, by extension. */
export function contentTypeForPath(path: string): string {
  const dot = path.lastIndexOf(".");
  const ext = dot === -1 ? "" : path.slice(dot).toLowerCase();
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}

/**
 * Resolve `prototypes/<name>/<rel>` (the pseudo-name `_shared` maps to
 * `prototypes/_shared/<rel>`) to an absolute path, guarding against traversal.
 * Returns `null` if the resolved path escapes `PROTOTYPES_DIR`.
 */
export function resolvePrototypeFile(name: string, rel: string): string | null {
  const abs = resolve(PROTOTYPES_DIR, name, rel);
  // Must stay strictly under PROTOTYPES_DIR (not the dir itself, and not a
  // sibling whose name is a prefix, e.g. `prototypes-evil`).
  if (abs !== PROTOTYPES_DIR && !abs.startsWith(PROTOTYPES_DIR + sep)) {
    return null;
  }
  return abs;
}
