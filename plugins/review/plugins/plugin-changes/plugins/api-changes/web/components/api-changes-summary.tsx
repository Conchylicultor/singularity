import { Badge } from "@plugins/primitives/plugins/badge/web";
import type { PluginChangeDiff, PluginReviewProps } from "@plugins/review/plugins/plugin-changes/core";

function totalDiffCount(plugin: PluginChangeDiff): number {
  return (
    plugin.slots.added.length + plugin.slots.removed.length +
    plugin.contributions.added.length + plugin.contributions.removed.length +
    plugin.exports.added.length + plugin.exports.removed.length +
    plugin.routes.added.length + plugin.routes.removed.length +
    plugin.apiUses.added.length + plugin.apiUses.removed.length +
    plugin.resources.added.length + plugin.resources.removed.length +
    plugin.tables.added.length + plugin.tables.removed.length
  );
}

export function ApiChangesSummary({ plugin }: PluginReviewProps) {
  const count = totalDiffCount(plugin);
  if (count === 0) return null;
  return (
    <Badge size="sm" colorClass="bg-categorical-5/15 text-categorical-5" className="shrink-0 font-semibold">
      {count} API
    </Badge>
  );
}
