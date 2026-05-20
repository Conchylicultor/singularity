import { Conversation } from "../slots";

export function ActionBarView() {
  return (
    <div className="flex w-full items-center gap-1">
      <Conversation.ActionBar.Render>
        {(item) => <item.component />}
      </Conversation.ActionBar.Render>
    </div>
  );
}
