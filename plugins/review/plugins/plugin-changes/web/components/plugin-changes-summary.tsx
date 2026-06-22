import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import type { Source } from "@plugins/review/web";
import { useWorktreePluginChanges, usePushPluginChanges } from "../use-plugin-changes";

function CountBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <Badge variant="info" className="font-semibold">
      {count} {count === 1 ? "plugin" : "plugins"}
    </Badge>
  );
}

function WorktreeSummary({ conversationId }: { conversationId: string }) {
  const { data } = useWorktreePluginChanges(conversationId);
  return <CountBadge count={data?.plugins.length ?? 0} />;
}

function PushSummary({ pushId }: { pushId: string }) {
  const { data } = usePushPluginChanges(pushId);
  return <CountBadge count={data?.plugins.length ?? 0} />;
}

export function PluginChangesSummary({
  conversationId,
  source,
}: {
  conversationId: string;
  source: Source;
}) {
  if (source.kind === "push") {
    return <PushSummary pushId={source.pushId} />;
  }
  return <WorktreeSummary conversationId={conversationId} />;
}
