import { relative, sep } from "node:path";
import { isPrototypeId } from "../../core";
import {
  HISTORY_DIR_NAME,
  LATEST_STAMP_FILE,
} from "../../shared/history/store";

/**
 * What a path the watcher reported is, as far as the tree's two consumers care:
 *
 * - `version-recorded` — `_history/<id>.git/latest.json`: a version of `id` was
 *   just recorded, by this backend or any other. Re-reads that one history; the
 *   prototype's bytes did not move, so nothing reloads.
 * - `history-internal` — anything else under `_history/` (a staging repo, a
 *   lock): nothing to react to.
 * - `tree` — everything else: a prototype's own files, `_template/`. Goes
 *   through the signature gate like before.
 */
export type TreePath =
  | { kind: "version-recorded"; id: string }
  | { kind: "history-internal" }
  | { kind: "tree" };

export function classifyTreePath(root: string, path: string): TreePath {
  const segments = relative(root, path).split(sep);
  if (segments[0] !== HISTORY_DIR_NAME) return { kind: "tree" };

  const [, repo, file] = segments;
  const id = repo?.endsWith(".git") ? repo.slice(0, -".git".length) : "";
  if (
    segments.length === 3 &&
    file === LATEST_STAMP_FILE &&
    isPrototypeId(id)
  ) {
    return { kind: "version-recorded", id };
  }
  return { kind: "history-internal" };
}
