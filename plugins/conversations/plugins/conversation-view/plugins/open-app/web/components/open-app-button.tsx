import { MdRocketLaunch } from "react-icons/md";
import { PaneIconAction } from "@plugins/primitives/plugins/pane/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { useConversationById } from "@plugins/conversations/web";
import { useAttemptSourceUrl } from "@plugins/tasks/plugins/task-source-url/web";
import {
  asNamespace,
  namespaceUrl,
} from "@plugins/infra/plugins/namespace/core";

export function OpenAppButton() {
  const { convId } = conversationPane.useParams();
  const conversation = useConversationById(convId);
  if (!conversation) return null;
  return <OpenAppAction attemptId={conversation.attemptId} />;
}

function OpenAppAction({ attemptId }: { attemptId: string }) {
  const source = useAttemptSourceUrl(attemptId);
  if (source.isError) throw source.error;
  return (
    <PaneIconAction
      label="Open app"
      icon={MdRocketLaunch}
      // Pending until we know whether the task was filed from a page: opening
      // `/` meanwhile would be a guess the click cannot take back.
      loading={source.isPending}
      onClick={() =>
        // An attempt id IS its worktree checkout name, and the main
        // composition's prefix elides — so the attempt id is the namespace.
        window.open(
          namespaceUrl(asNamespace(attemptId), sourcePath(source.data?.url)),
          "_blank",
        )
      }
    />
  );
}

/**
 * The route of the page the task was filed from — path, query and hash, with
 * its host dropped: that page was on whichever namespace the user was
 * browsing (usually main), and we open the same route on the agent's own.
 */
function sourcePath(url: string | null | undefined): string {
  if (!url) return "/";
  const parsed = new URL(url);
  return parsed.pathname + parsed.search + parsed.hash;
}
