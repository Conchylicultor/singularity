import { Conversation } from "../slots";

export function ActionBarView() {
  const items = Conversation.ActionBar.useContributions();
  if (items.length === 0) return null;
  return (
    <div className="flex items-center gap-1">
      <Conversation.ActionBar.Render>
        {(item) => <item.component />}
      </Conversation.ActionBar.Render>
    </div>
  );
}
