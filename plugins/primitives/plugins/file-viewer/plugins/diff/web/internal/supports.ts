import type { FileRendererTarget } from "@plugins/primitives/plugins/file-viewer/web";

/**
 * The diff is a contextual view: offered only for a file the host says has
 * changed in its checkout — wherever the file's bytes are read from, so a host
 * file inside a checkout gets it too. A clean or unknown status has nothing to
 * diff.
 */
export function supportsDiff({
  git,
}: FileRendererTarget): "contextual" | false {
  if (git === undefined || git.status === "clean") return false;
  return "contextual";
}
