import { useFileContent } from "@plugins/conversations/plugins/conversation-view/plugins/code/plugins/file-pane/web";
import { Markdown } from "@plugins/primitives/plugins/markdown/web";
import { Placeholder } from "@plugins/primitives/plugins/placeholder/web";
import { Text } from "@plugins/primitives/plugins/text/web";

export function MarkdownView({
  worktree,
  path,
}: {
  worktree: string;
  path: string;
}) {
  const state = useFileContent(worktree, path);

  if (state.kind === "loading") {
    return <Placeholder>Loading…</Placeholder>;
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

  return (
    <Text as="div" variant="body" className="px-4 py-3">
      <Markdown>{state.content}</Markdown>
    </Text>
  );
}
