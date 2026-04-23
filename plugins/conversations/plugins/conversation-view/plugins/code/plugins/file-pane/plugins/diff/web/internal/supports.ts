import type { FileRendererTarget } from "../../../../web/slots";

export function supportsDiff(file: FileRendererTarget): "contextual" | false {
  if (
    file.status !== "modified" &&
    file.status !== "added" &&
    file.status !== "deleted" &&
    file.status !== "untracked"
  ) {
    return false;
  }
  return "contextual";
}
