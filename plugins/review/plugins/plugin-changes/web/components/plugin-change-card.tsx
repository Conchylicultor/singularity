import { useState } from "react";
import {
  MdAdd,
  MdRemove,
  MdExpandMore,
  MdExpandLess,
} from "react-icons/md";
import type { DiffList, PluginChangeDiff } from "../../core/protocol";

function DiffSection({
  label,
  diff,
}: {
  label: string;
  diff: DiffList;
}) {
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

function hasDiffs(plugin: PluginChangeDiff): boolean {
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

export function PluginChangeCard({ plugin }: { plugin: PluginChangeDiff }) {
  const hasDiffContent = hasDiffs(plugin);
  const [expanded, setExpanded] = useState(hasDiffContent);

  return (
    <div className="rounded-lg border border-border/60 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/30"
      >
        {expanded ? (
          <MdExpandLess className="size-4 text-muted-foreground shrink-0" />
        ) : (
          <MdExpandMore className="size-4 text-muted-foreground shrink-0" />
        )}
        <span className="text-sm font-medium truncate">
          {plugin.hierarchyId}
        </span>
        <span
          className={`ml-auto shrink-0 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${
            plugin.status === "added"
              ? "bg-green-500/15 text-green-600 dark:text-green-400"
              : "bg-blue-500/15 text-blue-600 dark:text-blue-400"
          }`}
        >
          {plugin.status}
        </span>
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
          {plugin.fileCount}f
          {plugin.additions > 0 && (
            <span className="text-green-600 dark:text-green-400">
              {" "}+{plugin.additions}
            </span>
          )}
          {plugin.deletions > 0 && (
            <span className="text-red-400"> -{plugin.deletions}</span>
          )}
        </span>
      </button>
      {expanded && hasDiffContent && (
        <div className="flex flex-col gap-3 px-3 pb-3 pt-1 border-t border-border/40">
          <DiffSection label="Slots" diff={plugin.slots} />
          <DiffSection label="Contributions" diff={plugin.contributions} />
          <DiffSection label="Exports" diff={plugin.exports} />
          <DiffSection label="Routes" diff={plugin.routes} />
          <DiffSection label="Resources" diff={plugin.resources} />
          <DiffSection label="Tables" diff={plugin.tables} />
          <DiffSection label="API Uses" diff={plugin.apiUses} />
        </div>
      )}
    </div>
  );
}
