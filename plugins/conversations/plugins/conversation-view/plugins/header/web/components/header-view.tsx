import { Conversation } from "../slots";

export function HeaderView() {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <Conversation.Header.Render>
        {(item) => <item.component />}
      </Conversation.Header.Render>
    </span>
  );
}
