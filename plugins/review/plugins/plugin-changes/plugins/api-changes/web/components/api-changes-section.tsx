import { MdAdd, MdRemove } from "react-icons/md";
import type { DiffList, PluginChangeDiff, PluginReviewProps } from "@plugins/review/plugins/plugin-changes/core";

function DiffSection({ label, diff }: { label: string; diff: DiffList }) {
  if (diff.added.length === 0 && diff.removed.length === 0) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        {label}
      </span>
      {diff.added.map((item) => (
        <span key={item} className="flex items-center gap-1.5 text-xs">
          <MdAdd className="size-3 text-green-500 shrink-0" />
          <code className="text-green-600 dark:text-green-400">{item}</code>
        </span>
      ))}
      {diff.removed.map((item) => (
        <span key={item} className="flex items-center gap-1.5 text-xs">
          <MdRemove className="size-3 text-red-500 shrink-0" />
          <code className="text-red-400">{item}</code>
        </span>
      ))}
    </div>
  );
}

export function hasDiffs(plugin: PluginChangeDiff): boolean {
  return (
    plugin.slots.added.length + plugin.slots.removed.length +
    plugin.contributions.added.length + plugin.contributions.removed.length +
    plugin.exports.added.length + plugin.exports.removed.length +
    plugin.routes.added.length + plugin.routes.removed.length +
    plugin.apiUses.added.length + plugin.apiUses.removed.length +
    plugin.resources.added.length + plugin.resources.removed.length +
    plugin.tables.added.length + plugin.tables.removed.length > 0
  );
}

export function ApiChangesSection({ plugin }: PluginReviewProps) {
  return (
    <div className="flex flex-col gap-3">
      <DiffSection label="Slots" diff={plugin.slots} />
      <DiffSection label="Contributions" diff={plugin.contributions} />
      <DiffSection label="Exports" diff={plugin.exports} />
      <DiffSection label="Routes" diff={plugin.routes} />
      <DiffSection label="Resources" diff={plugin.resources} />
      <DiffSection label="Tables" diff={plugin.tables} />
      <DiffSection label="API Uses" diff={plugin.apiUses} />
    </div>
  );
}
