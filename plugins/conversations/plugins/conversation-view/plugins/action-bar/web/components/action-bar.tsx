import { PluginErrorBoundary } from "@core";
import { Conversation } from "../slots";

export function ActionBarView() {
  const items = Conversation.ActionBar.useContributions();
  if (items.length === 0) return null;
  return (
    <div className="flex items-center gap-1">
      {items.map((item, i) => {
        const Component = item.component;
        return (
          <PluginErrorBoundary key={i} slot={Conversation.ActionBar.id}>
            <Component />
          </PluginErrorBoundary>
        );
      })}
    </div>
  );
}
