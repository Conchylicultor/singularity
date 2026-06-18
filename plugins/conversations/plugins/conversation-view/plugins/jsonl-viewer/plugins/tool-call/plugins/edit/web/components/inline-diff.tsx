import { TextDiff } from "@plugins/primitives/plugins/diff-view/web";

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
