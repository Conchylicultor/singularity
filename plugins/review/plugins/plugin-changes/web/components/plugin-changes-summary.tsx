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
    <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-info/15 text-info tabular-nums">
      {count} {count === 1 ? "plugin" : "plugins"}
    </span>
  );
}
