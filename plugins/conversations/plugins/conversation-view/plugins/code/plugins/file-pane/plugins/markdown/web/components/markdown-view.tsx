import { useFileContent } from "@plugins/conversations/plugins/conversation-view/plugins/code/plugins/file-pane/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { Markdown } from "@plugins/primitives/plugins/markdown/web";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import { Text } from "@plugins/primitives/plugins/text/web";
import { splitFrontmatter } from "../internal/frontmatter";
import { FrontmatterCard } from "./frontmatter-card";

export function MarkdownView({
  worktree,
  path,
}: {
  worktree: string;
  path: string;
}) {
  const state = useFileContent(worktree, path);

  if (state.kind === "loading") {
    return <Loading />;
  }
  if (state.kind === "error") {
    const message =
      state.status === 413
        ? "File is too large to preview."
        : state.status === 415
          ? "Binary file — no preview available."
          : state.status === 404
            ? "File not found."
            : state.message || "Failed to load file.";
    return <Placeholder tone="error">{message}</Placeholder>;
  }

  const split = splitFrontmatter(state.content);

  return (
    <Text as="div" variant="body" className="px-lg py-md">
      {split && <FrontmatterCard fields={split.fields} />}
      {(split ? split.body : state.content).trim() && (
        <Markdown>{split ? split.body : state.content}</Markdown>
      )}
    </Text>
  );
}
