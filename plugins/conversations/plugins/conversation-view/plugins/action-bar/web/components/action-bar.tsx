import { PluginErrorBoundary } from "@plugins/primitives/plugins/error-boundary/web";
import { Reorder } from "@plugins/reorder/web";
import { Conversation } from "../slots";

export function ActionBarView() {
  const { items, DndWrapper, ReorderItem } = Reorder.useArea(
    Conversation.ActionBar,
  );
  if (items.length === 0) return null;
  return (
    <div className="flex items-center gap-1">
      <DndWrapper>
        {items.map((item) => {
          const Component = item.component;
          return (
            <ReorderItem key={item.id} item={item}>
              <PluginErrorBoundary slot={Conversation.ActionBar.id}>
                <Component />
              </PluginErrorBoundary>
            </ReorderItem>
          );
        })}
      </DndWrapper>
    </div>
  );
}
