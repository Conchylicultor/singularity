import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import type { Source } from "@plugins/review/web";
import { usePluginChanges } from "../use-plugin-changes";

export function PluginChangesSummary({
  conversationId,
  source,
}: {
  conversationId: string;
  source: Source;
}) {
  const { data } = usePluginChanges(conversationId, source);
  const count = data?.plugins.length ?? 0;
  if (count === 0) return null;

  return (
    <Badge variant="info" className="font-semibold">
      {count} {count === 1 ? "plugin" : "plugins"}
    </Badge>
  );
}
