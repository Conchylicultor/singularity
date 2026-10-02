import { DiffOrImageView } from "@plugins/primitives/plugins/diff-view/web";
import type { FileRendererProps } from "@plugins/primitives/plugins/file-viewer/web";

/** The checkout file vs HEAD (side-by-side text, or before/after for an image). */
export function FileDiffView({ file }: FileRendererProps) {
  // supportsDiff offers this renderer for checkout files only.
  if (file.source !== "git") {
    throw new Error(`Diff renderer mounted for a ${file.source} file`);
  }
  return <DiffOrImageView worktree={file.worktree} path={file.path} />;
}
