import type { FileRendererTarget } from "@plugins/conversations/plugins/conversation-view/plugins/code/plugins/file-pane/web";

export function supportsDiff(file: FileRendererTarget): "contextual" | false {
  if (
    file.status !== "modified" &&
    file.status !== "added" &&
    file.status !== "deleted" &&
    file.status !== "untracked" &&
    file.status !== "renamed" &&
    file.status !== "copied"
  ) {
    return false;
  }
  return "contextual";
}
