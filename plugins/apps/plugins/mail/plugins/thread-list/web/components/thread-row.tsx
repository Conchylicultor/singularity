import type { ReactElement } from "react";
import {
  MdStar,
  MdStarBorder,
  MdAttachFile,
  MdLabelImportant,
} from "react-icons/md";
import type { MailThread } from "@plugins/apps/plugins/mail/plugins/mail-core/core";
import { threadPane } from "@plugins/apps/plugins/mail/plugins/reading-pane/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { Row } from "@plugins/primitives/plugins/css/plugins/row/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { RelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import { senderSummary } from "../internal/sender-summary";

/**
 * One Gmail-style thread row: a leading star (display-only in this read-only
 * phase), then a two-line block — senders + important/attachment markers +
 * relative date on the first line, subject + inline snippet on the second.
 * Unread threads render their senders and subject in a bold weight. Clicking the
 * row opens the reading pane (`threadPane`) as a pushed column.
 */
export function ThreadRow({
  thread,
  selected,
}: {
  thread: MailThread;
  selected: boolean;
}): ReactElement {
  const openPane = useOpenPane();
  const bold = thread.unread ? "font-semibold" : undefined;
  const sortDate = thread.lastMessageAt ?? thread.createdAt;

  return (
    <Row
      selected={selected}
      onClick={() =>
        openPane(threadPane, { threadId: thread.id }, { mode: "push" })
      }
      icon={
        thread.starred ? (
          <MdStar className="icon-auto text-warning" />
        ) : (
          <MdStarBorder className="icon-auto text-muted-foreground" />
        )
      }
    >
      <Fill>
        <Stack gap="2xs">
          <Line>
            <Fill>
              <Text
                variant="body"
                tone={thread.unread ? "default" : "muted"}
                className={bold}
              >
                {senderSummary(thread)}
              </Text>
            </Fill>
            {thread.important && (
              <MdLabelImportant className="icon-auto text-warning" />
            )}
            {thread.hasAttachments && (
              <MdAttachFile className="icon-auto text-muted-foreground" />
            )}
            <Text variant="caption" tone="muted">
              <RelativeTime date={new Date(sortDate)} />
            </Text>
          </Line>
          <Line>
            <Text variant="body" className={bold}>
              {thread.subject || "(no subject)"}
            </Text>
            {thread.snippet ? (
              <Text variant="body" tone="muted">
                {` — ${thread.snippet}`}
              </Text>
            ) : null}
          </Line>
        </Stack>
      </Fill>
    </Row>
  );
}
