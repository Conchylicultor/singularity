import { DiffOrImageView } from "@plugins/primitives/plugins/diff-view/web";
import type { FileRendererProps } from "@plugins/primitives/plugins/file-viewer/web";

/**
 * The file vs its checkout's base (side-by-side text, or before/after for an
 * image), read from the git context — not from where the file's bytes live.
 */
export function FileDiffView({ git }: FileRendererProps) {
  // supportsDiff offers this renderer only for a target carrying git context.
  if (git === undefined) {
    throw new Error("Diff renderer mounted without git context");
  }
  return <DiffOrImageView worktree={git.checkout} path={git.path} />;
}
