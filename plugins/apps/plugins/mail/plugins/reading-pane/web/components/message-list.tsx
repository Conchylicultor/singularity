import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import {
  Inset,
  Stack,
} from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import type { ResourcePaging } from "@plugins/primitives/plugins/live-state/web";
import type { MailMessage } from "@plugins/apps/plugins/mail/plugins/mail-core/core";
import { MessageCard } from "./message-card";

export interface MessageListProps {
  /** The loaded messages, oldest→newest. */
  messages: MailMessage[];
  /** The window's paging handles: growing it loads OLDER messages. */
  older: ResourcePaging;
}

// The scrolling body of the reading pane: the thread's loaded messages, oldest→
// newest, each a collapsible card. The last (newest) card is expanded by
// default. A thread longer than the loaded window offers "Load older messages"
// above the first card.
export function MessageList({ messages, older }: MessageListProps) {
  if (messages.length === 0) {
    return (
      <Center axis="both">
        <Placeholder tone="muted">This thread has no messages.</Placeholder>
      </Center>
    );
  }

  const lastIndex = messages.length - 1;
  return (
    <Scroll axis="y" fill>
      <Inset pad="md">
        <Stack gap="sm">
          {older.canGrow || older.growing ? (
            <Center axis="horizontal">
              <Button
                variant="ghost"
                loading={older.growing}
                onClick={older.loadMore}
              >
                Load older messages
              </Button>
            </Center>
          ) : null}
          {messages.map((message, i) => (
            <MessageCard
              key={message.id}
              message={message}
              defaultOpen={i === lastIndex}
            />
          ))}
        </Stack>
      </Inset>
    </Scroll>
  );
}
