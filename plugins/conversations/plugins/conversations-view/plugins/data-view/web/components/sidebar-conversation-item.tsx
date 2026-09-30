import type { ReactElement } from "react";
import { useConfig } from "@plugins/config_v2/web";
import { ConversationItem } from "@plugins/conversations/plugins/conversation-ui/plugins/item/web";
import { useTaskShortTitle } from "@plugins/tasks/plugins/task-title/web";
import type { Conversation } from "@plugins/tasks/plugins/tasks-core/core";
import { conversationListConfig } from "../../shared/config";
import { resolveListTitle } from "../internal/list-title";

/**
 * One row of the conversations list (every source's `renderRow`), named per the
 * `titleMode` setting. Only this list reads the setting — chips and every other
 * surface keep the conversation title.
 *
 * `useConfig` (not `useConfigResult`): every mode's label is a true name for the
 * row, so the defaults answer of the unreachable-after-boot pending window
 * asserts nothing about the user's data.
 *
 * `muted` dims the title for a source-specific reason (the Queue's blocked rows).
 */
export function SidebarConversationItem({
  conv,
  muted,
}: {
  conv: Conversation;
  muted?: boolean;
}): ReactElement {
  const { titleMode } = useConfig(conversationListConfig);
  // Split so only the short mode subscribes to the short-title rows.
  if (titleMode === "short")
    return <ShortTitleItem conv={conv} muted={muted} />;
  return (
    <ConversationItem
      conv={conv}
      layout="line"
      muted={muted}
      title={resolveListTitle(titleMode, conv, null)}
    />
  );
}

function ShortTitleItem({
  conv,
  muted,
}: {
  conv: Conversation;
  muted?: boolean;
}): ReactElement {
  const short = useTaskShortTitle(conv.taskId);
  return (
    <ConversationItem
      conv={conv}
      layout="line"
      muted={muted}
      title={resolveListTitle(
        "short",
        conv,
        short.status === "ready" && short.found ? short.row : null,
      )}
    />
  );
}
