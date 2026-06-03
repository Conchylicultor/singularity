import { TextDiff } from "@plugins/conversations/plugins/conversation-view/plugins/code/plugins/file-pane/plugins/diff/web";

export function InlineDiff({
  oldText,
  newText,
  path,
}: {
  oldText: string;
  newText: string;
  path: string;
}) {
  return <TextDiff oldText={oldText} newText={newText} path={path} />;
}
