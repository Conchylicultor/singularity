import { useMemo } from "react";
import { useExpandAll, ExpandAllButton } from "@plugins/primitives/plugins/collapsible/web";
import { Text } from "@plugins/primitives/plugins/text/web";
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

  const allPaths = useMemo(
    () => data?.plugins.map((p) => p.path) ?? [],
    [data],
  );

  const { expanded: expandedSet, allExpanded, toggleAll, toggle } = useExpandAll(allPaths);

  if (isPending) {
    return (
      <Text as="p" variant="body" className="text-muted-foreground px-1">Loading plugins...</Text>
    );
  }
  if (error) {
    return (
      <Text as="p" variant="body" className="text-destructive px-1">Error: {String(error)}</Text>
    );
  }
  if (data.plugins.length === 0) {
    return (
      <Text as="p" variant="body" className="text-muted-foreground px-1">
        No plugin API changes detected.
      </Text>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-end">
        <ExpandAllButton
          variant="full"
          allExpanded={allExpanded}
          onToggle={toggleAll}
        />
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
