import { ViewerThumbnail } from "@plugins/primitives/plugins/overlay/plugins/image-viewer/web";
import { codeImageUrl } from "@plugins/code-explorer/plugins/code-api/core";

export function ReadImageView({
  worktree,
  filePath,
}: {
  worktree: string;
  filePath: string;
}) {
  const src = codeImageUrl(worktree, filePath);
  const name = filePath.slice(filePath.lastIndexOf("/") + 1);

  return <ViewerThumbnail image={{ src, name, sourceLabel: "Read" }} />;
}
