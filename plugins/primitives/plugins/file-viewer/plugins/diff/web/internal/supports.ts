import type { FileRendererTarget } from "@plugins/primitives/plugins/file-viewer/web";

/**
 * The diff is a contextual view: offered only for a checkout file the host
 * says has changed. A clean or unknown status — and any host file — has
 * nothing to diff.
 */
export function supportsDiff({
  file,
  gitStatus,
}: FileRendererTarget): "contextual" | false {
  if (file.source !== "git") return false;
  if (gitStatus === undefined || gitStatus === "clean") return false;
  return "contextual";
}
