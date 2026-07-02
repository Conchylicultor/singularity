import { type ReactElement } from "react";
import { MdStar } from "react-icons/md";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { Row } from "@plugins/primitives/plugins/css/plugins/row/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { StatusDot } from "@plugins/primitives/plugins/css/plugins/status-dot/web";
import { RelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import type { MailMessage } from "@plugins/apps/plugins/mail/plugins/mail-core/core";
import { mailMessagePane } from "../panes";

/**
 * One search hit: a clickable Gmail-style condensed row (sender + time, subject,
 * snippet). Clicking opens the reader pane to the right, handing the envelope in
 * as `input` so the header renders instantly while the body hydrates.
 *
 * Follow-up: no label / attachment chips — labels are a join table and
 * `hasAttachments` is unknown until the message is hydrated (opened).
 */
export function MailSearchRow({ message }: { message: MailMessage }): ReactElement {
  const openPane = useOpenPane();
  const sender = message.from.name ?? message.from.email;

  return (
    <Row
      onClick={() =>
        openPane(
          mailMessagePane,
          { messageId: message.id },
          { mode: "push", side: "right", input: message },
        )
      }
      // Transparent when read, so the leading column stays aligned across rows.
      icon={<StatusDot colorClass={message.unread ? "bg-primary" : "bg-transparent"} />}
    >
      <Fill>
        <Stack gap="none">
          <Line>
            <Fill>
              <Text variant="label">{sender}</Text>
            </Fill>
            {message.starred && <MdStar className="text-primary" />}
            {message.internalDate && (
              <Text variant="caption" tone="muted">
                <RelativeTime date={message.internalDate} />
              </Text>
            )}
          </Line>
          <Line>
            <Text variant="body">{message.subject || "(no subject)"}</Text>
          </Line>
          {message.snippet && (
            <Line>
              <Text variant="caption" tone="muted">
                {message.snippet}
              </Text>
            </Line>
          )}
        </Stack>
      </Fill>
    </Row>
  );
}
