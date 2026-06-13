import { useMemo } from "react";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { useConversationById } from "@plugins/conversations/web";
import { filePeekPane } from "@plugins/conversations/plugins/conversation-view/plugins/code/plugins/file-pane/web";
import { taskDetailPane } from "@plugins/tasks/plugins/task-detail/web";

// Resolves the file-open handler shared by every conversation/task-scoped
// inline renderer: the markdown file-links + code enhancers and the plain-text
// inline walker. Opens a file-peek pane in the right worktree:
//   - inside a conversation → that conversation's attempt worktree
//   - inside a task detail   → "main"
//   - inside a file-peek pane → that pane's worktree
//   - otherwise               → undefined (handlers no-op)
// Single source so the markdown and plain-text file-open behavior can't diverge.
export function useFileOpen():
  | ((path: string, line?: number) => void)
  | undefined {
  const convId = conversationPane.useRouteEntry()?.params.convId ?? null;
  const conversation = useConversationById(convId);
  const taskEntry = taskDetailPane.useRouteEntry();
  const peekWorktree = filePeekPane.useRouteEntry()?.params.worktree;
  const openPane = useOpenPane();

  const worktree =
    conversation?.attemptId ?? (taskEntry ? "main" : peekWorktree);

  return useMemo(() => {
    if (!worktree) return undefined;
    return (path: string, line?: number) =>
      openPane(
        filePeekPane,
        { worktree, filePath: line != null ? `${path}:${line}` : path },
        { mode: "push" },
      );
  }, [worktree, openPane]);
}
