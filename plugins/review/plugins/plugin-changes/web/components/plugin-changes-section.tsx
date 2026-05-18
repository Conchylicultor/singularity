import { usePluginChanges } from "../use-plugin-changes";
import { PluginChangeCard } from "./plugin-change-card";

export function PluginChangesSection({
  conversationId,
}: {
  conversationId: string;
}) {
  const { data, isPending, error } = usePluginChanges(conversationId);

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
      {data.plugins.map((plugin) => (
        <PluginChangeCard
          key={plugin.path}
          conversationId={conversationId}
          plugin={plugin}
        />
      ))}
    </div>
  );
}
