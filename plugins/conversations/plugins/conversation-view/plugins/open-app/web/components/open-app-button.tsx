import { PaneIconAction } from "@plugins/primitives/plugins/pane/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { useConversationById } from "@plugins/conversations/web";
import { useAttemptSourceUrl } from "@plugins/tasks/plugins/task-source-url/web";
import {
  asNamespace,
  namespaceUrl,
} from "@plugins/infra/plugins/namespace/core";
import { symbol } from "@plugins/ui/plugins/icons/core";
import { useLive } from "@plugins/network/plugins/live/web";
import { opsHistory } from "@plugins/debug/plugins/profiling/plugins/op-log/plugins/op-store/core";

const rocketLaunchIcon = symbol("rocket-launch");

export function OpenAppButton() {
  const { convId } = conversationPane.useParams();
  const conversation = useConversationById(convId);
  if (!conversation) return null;
  return <OpenAppAction attemptId={conversation.attemptId} />;
}

function OpenAppAction({ attemptId }: { attemptId: string }) {
  const source = useAttemptSourceUrl(attemptId);
  if (source.isError) throw source.error;
  // Has this worktree ever deployed? Its latest successful build op — one row
  // is enough, and the op-store pushes the next one the moment it lands, so
  // the button enables itself when the agent's first build succeeds.
  const builds = useLive(opsHistory, {
    where: { opSlug: attemptId, kind: "build", outcome: "success" },
    limit: 1,
  });
  if (builds.status === "error") throw builds.error;
  const built = builds.status === "ready" && builds.data.length > 0;
  return (
    <PaneIconAction
      label={
        builds.status === "ready" && !built
          ? "Open app — not built yet"
          : "Open app"
      }
      icon={rocketLaunchIcon}
      // Pending until we know whether the task was filed from a page: opening
      // `/` meanwhile would be a guess the click cannot take back.
      loading={source.isPending || builds.status === "loading"}
      // Nothing is served at the namespace until its first build deploys it.
      disabled={!built}
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
