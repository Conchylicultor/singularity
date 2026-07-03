import { type ReactElement } from "react";
import { MdAttachFile, MdStar } from "react-icons/md";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { Row } from "@plugins/primitives/plugins/css/plugins/row/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { Cluster } from "@plugins/primitives/plugins/css/plugins/cluster/web";
import { StatusDot } from "@plugins/primitives/plugins/css/plugins/status-dot/web";
import { RelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import type { MailSearchResult } from "@plugins/apps/plugins/mail/plugins/sync/core";
import { mailMessagePane } from "../panes";
import { MailLabelChip } from "./mail-label-chip";

/**
 * One search hit: a clickable Gmail-style **thread-collapsed** row. Multiple
 * matches in one thread fold into a single row (keyed by `threadId`) whose
 * representative envelope is `result.message`; a subtle count pill shows the
 * thread size when more than one message matched. The row surfaces the
 * thread-level unread/star state, an attachment paperclip (`result.hasAttachments`,
 * pre-populated by the sync's `has:attachment` scan — no open needed), and the
 * thread's user-label chips (Gmail's own hex colors, via `MailLabelChip`).
 *
 * Clicking opens the reader pane to the right, handing the representative
 * envelope in as `input` (still a `MailMessage`) so the header renders instantly
 * while the body hydrates.
 */
export function MailSearchRow({ result }: { result: MailSearchResult }): ReactElement {
  const openPane = useOpenPane();
  const message = result.message;
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
      icon={<StatusDot colorClass={result.unread ? "bg-primary" : "bg-transparent"} />}
    >
      <Fill>
        {/* Outer 2xs gap sets the little top spacing before the label chips;
            the envelope lines below stay tight (`gap="none"`). With no labels
            the outer stack has one child, so the gap is inert. */}
        <Stack gap="2xs">
          <Stack gap="none">
            <Line>
              <Fill>
                <Text variant="label">{sender}</Text>
              </Fill>
              {result.messageCount > 1 && (
                <Badge variant="muted" shape="pill" mono>
                  {result.messageCount}
                </Badge>
              )}
              {result.hasAttachments && (
                <MdAttachFile className="text-muted-foreground" aria-label="Has attachment" />
              )}
              {result.starred && <MdStar className="text-primary" />}
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
          {result.labels.length > 0 && (
            <Cluster>
              {result.labels.map((l) => (
                <MailLabelChip key={l.id} label={l} />
              ))}
            </Cluster>
          )}
        </Stack>
      </Fill>
    </Row>
  );
}
