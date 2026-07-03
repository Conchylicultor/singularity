import type { ReactElement } from "react";
import { MdAttachFile, MdLabelImportant } from "react-icons/md";
import type { MailThread } from "@plugins/apps/plugins/mail/plugins/mail-core/core";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { RelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import { senderSummary } from "../internal/sender-summary";

/**
 * One Gmail-style thread row body: a two-line block — senders + important /
 * attachment markers + relative date on the first line, subject + inline snippet
 * on the second. Unread threads render their senders and subject in a bold
 * weight. Unlike thread-list's `ThreadRow`, this owns NO click/leading-star — the
 * DataView list wraps it in the selectable/clickable `Row` (leading star + row
 * activation are supplied by the list's `viewOptions.list`).
 */
export function InboxRow({ thread }: { thread: MailThread }): ReactElement {
  const bold = thread.unread ? "font-semibold" : undefined;
  const sortDate = thread.lastMessageAt ?? thread.createdAt;

  return (
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
  );
}
