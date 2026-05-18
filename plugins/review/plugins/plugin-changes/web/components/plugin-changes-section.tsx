import { useCallback, useMemo, useState } from "react";
import { MdUnfoldMore, MdUnfoldLess } from "react-icons/md";
import type { Source } from "@plugins/review/web";
import { usePluginChanges } from "../use-plugin-changes";
import { PluginChangeCard } from "./plugin-change-card";

export function PluginChangesSection({
  conversationId,
  source,
}: {
  conversationId: string;
  source: Source;
}) {
  const { data, isPending, error } = usePluginChanges(conversationId, source);
  const [expandedSet, setExpandedSet] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const allPaths = useMemo(
    () => data?.plugins.map((p) => p.path) ?? [],
    [data],
  );

  const allExpanded = allPaths.length > 0 && allPaths.every((p) => expandedSet.has(p));

  const toggleAll = useCallback(() => {
    setExpandedSet(allExpanded ? new Set() : new Set(allPaths));
  }, [allExpanded, allPaths]);

  const toggle = useCallback((path: string) => {
    setExpandedSet((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  if (isPending) {
    return (
      <p className="text-sm text-muted-foreground px-1">Loading plugins...</p>
    );
  }
  if (error) {
    return (
      <p className="text-sm text-red-400 px-1">Error: {String(error)}</p>
    );
  }
  if (data.plugins.length === 0) {
    return (
      <p className="text-sm text-muted-foreground px-1">
        No plugin API changes detected.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-end">
        <button
          onClick={toggleAll}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {allExpanded ? (
            <>
              <MdUnfoldLess className="size-3.5" />
              Collapse all
            </>
          ) : (
            <>
              <MdUnfoldMore className="size-3.5" />
              Expand all
            </>
          )}
        </button>
      </div>
      {data.plugins.map((plugin) => (
        <PluginChangeCard
          key={plugin.path}
          conversationId={conversationId}
          plugin={plugin}
          expanded={expandedSet.has(plugin.path)}
          onToggle={() => toggle(plugin.path)}
        />
      ))}
    </div>
  );
}
