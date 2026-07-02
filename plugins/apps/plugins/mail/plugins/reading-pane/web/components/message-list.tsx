import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import { Inset, Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import type { MailMessage } from "@plugins/apps/plugins/mail/plugins/mail-core/core";
import { MessageCard } from "./message-card";

// The scrolling body of the reading pane: every message of the thread, oldest→
// newest, each a collapsible card. The last (newest) card is expanded by default.
export function MessageList({ messages }: { messages: MailMessage[] }) {
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
