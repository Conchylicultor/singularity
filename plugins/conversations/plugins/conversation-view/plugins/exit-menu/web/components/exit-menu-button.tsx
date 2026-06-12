import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@plugins/primitives/plugins/ui-kit/web";
import { Fragment, useMemo } from "react";
import { MdLogout } from "react-icons/md";
import type { Contribution } from "@plugins/framework/plugins/web-sdk/core";
import { renderIsolated } from "@plugins/primitives/plugins/slot-render/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { useConversationById } from "@plugins/conversations/web";
import type { PromptEditorActionProps } from "@plugins/primitives/plugins/prompt-editor/web";
import { ExitMenu } from "../slots";

export function ExitMenuButton(_: PromptEditorActionProps) {
  const { convId } = conversationPane.useParams();
  const conversation = useConversationById(convId);
  const items = ExitMenu.Item.useContributions();
  const sorted = useMemo(
    () => [...items].sort((a, b) => a.order - b.order),
    [items],
  );

  if (!conversation) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon-sm" aria-label="Close options" title="Close options" />
        }
      >
        <MdLogout className="size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {sorted.map((item) => (
          <Fragment key={item.id}>
            {renderIsolated(ExitMenu.Item.id, item as unknown as Contribution, { conversation })}
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
