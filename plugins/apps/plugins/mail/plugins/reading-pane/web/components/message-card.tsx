import { MdExpandLess } from "react-icons/md";
import {
  ControlSizeProvider,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Surface } from "@plugins/primitives/plugins/css/plugins/surface/web";
import { Inset, Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Inline } from "@plugins/primitives/plugins/css/plugins/inline/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Row } from "@plugins/primitives/plugins/css/plugins/row/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Avatar } from "@plugins/primitives/plugins/avatar/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { RelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import { useCollapsible } from "@plugins/primitives/plugins/collapsible/web";
import type { MailMessage } from "@plugins/apps/plugins/mail/plugins/mail-core/core";
import { addressLabel, recipientsLabel } from "../internal/format-address";
import { MessageBody } from "./message-body";

export interface MessageCardProps {
  message: MailMessage;
  /** The newest message opens by default; older ones collapse to a summary. */
  defaultOpen: boolean;
}

// One message in a thread: a raised card that collapses to a one-line summary
// (sender · snippet · date) and expands to the full header + body. The body is
// only mounted (and hydrated) while expanded.
export function MessageCard({ message, defaultOpen }: MessageCardProps) {
  const { open, toggle, contentId, triggerProps } = useCollapsible({
    defaultOpen,
  });

  const fromLabel = addressLabel(message.from);
  const date = message.internalDate;
  const absolute = date ? date.toLocaleString() : undefined;

  return (
    <Surface level="raised" className="rounded-lg">
      <Inset pad="md">
        {open ? (
          <Stack gap="sm">
            <Inline gap="sm" align="start">
              <Avatar fallbackGlyph={fromLabel} fallbackKey={message.from.email} />
              <Fill>
                <Stack gap="none">
                  <Text variant="label">{fromLabel}</Text>
                  {message.from.name ? (
                    <Text variant="caption" tone="muted">
                      {message.from.email}
                    </Text>
                  ) : null}
                  {message.to.length > 0 ? (
                    <Text variant="caption" tone="muted">
                      to {recipientsLabel(message.to)}
                    </Text>
                  ) : null}
                </Stack>
              </Fill>
              <Inline gap="2xs" align="center">
                {date ? (
                  <Text variant="caption" tone="muted" title={absolute}>
                    <RelativeTime date={date} />
                  </Text>
                ) : null}
                <IconButton
                  icon={MdExpandLess}
                  label="Collapse"
                  onClick={toggle}
                />
              </Inline>
            </Inline>
            <div id={contentId}>
              <MessageBody messageId={message.id} />
            </div>
          </Stack>
        ) : (
          <Row
            icon={
              <ControlSizeProvider size="sm">
                <Avatar
                  fallbackGlyph={fromLabel}
                  fallbackKey={message.from.email}
                />
              </ControlSizeProvider>
            }
            actionsAlwaysVisible
            actions={
              date ? (
                <Text variant="caption" tone="muted" title={absolute}>
                  <RelativeTime date={date} />
                </Text>
              ) : null
            }
            title={message.snippet ?? fromLabel}
            {...triggerProps}
          >
            <Text variant="label">{fromLabel}</Text>
            <Text tone="muted">{message.snippet ?? ""}</Text>
          </Row>
        )}
      </Inset>
    </Surface>
  );
}
