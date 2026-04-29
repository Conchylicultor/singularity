import type { FileRendererTarget } from "@plugins/conversations/plugins/conversation-view/plugins/code/plugins/file-pane/web";

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
