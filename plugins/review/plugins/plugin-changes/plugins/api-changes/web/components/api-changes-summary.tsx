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
    <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-600 dark:text-purple-400">
      {count} API
    </span>
  );
}
