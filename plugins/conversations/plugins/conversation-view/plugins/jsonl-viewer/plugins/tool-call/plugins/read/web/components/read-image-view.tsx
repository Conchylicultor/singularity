import { ViewerThumbnail } from "@plugins/primitives/plugins/overlay/plugins/image-viewer/web";

export function ReadImageView({
  worktree,
  filePath,
}: {
  worktree: string;
  filePath: string;
}) {
  const src = `/api/code/${encodeURIComponent(worktree)}/image?path=${encodeURIComponent(filePath)}`;
  const name = filePath.slice(filePath.lastIndexOf("/") + 1);

  return <ViewerThumbnail image={{ src, name, sourceLabel: "Read" }} />;
}
