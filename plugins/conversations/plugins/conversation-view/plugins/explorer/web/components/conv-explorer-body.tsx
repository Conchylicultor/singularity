import { FileBrowser } from "@plugins/apps/plugins/file-explorer/plugins/browser/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { useConversation } from "@plugins/conversations/web";
import { ResourceErrorInline } from "@plugins/primitives/plugins/live-state/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";

export function ConvExplorerBody() {
  const convId = conversationPane.useRouteEntry()?.params.convId;
  if (convId === undefined)
    return <Placeholder>No conversation open.</Placeholder>;
  return <ConvExplorer convId={convId} />;
}

function ConvExplorer({ convId }: { convId: string }) {
  const result = useConversation(convId);
  if (result.status === "loading") return <Loading variant="rows" />;
  if (result.status === "error") {
    return (
      <ResourceErrorInline
        variant="block"
        subject="the conversation"
        error={result.error}
        refetch={result.refetch}
      />
    );
  }
  if (result.data === null) {
    return <Placeholder>This conversation no longer exists.</Placeholder>;
  }
  // A reaped worktree is not special-cased: the browser renders its root
  // listing's `missing` answer ("… does not exist") like any other folder.
  const worktree = result.data.worktreePath;
  // Keyed by the checkout: an embedded browser keeps its own history, which
  // must not carry over from another conversation's worktree.
  return <FileBrowser key={worktree} initialPath={worktree} root={worktree} />;
}
