import { DiffView } from "../components/diff-view";
import { ImageDiffView } from "../components/image-diff-view";

const IMAGE_EXTS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "svg", "ico", "bmp", "avif",
]);

function isImagePath(path: string): boolean {
  const base = path.slice(path.lastIndexOf("/") + 1).toLowerCase();
  const dot = base.lastIndexOf(".");
  if (dot < 0) return false;
  return IMAGE_EXTS.has(base.slice(dot + 1));
}

export function DiffOrImageView(props: {
  worktree: string;
  path: string;
  base?: string;
  head?: string;
  from?: string;
}) {
  return isImagePath(props.path) ? ImageDiffView(props) : DiffView(props);
}
