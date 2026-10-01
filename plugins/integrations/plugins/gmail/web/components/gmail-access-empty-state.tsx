import type { ReactElement, ReactNode } from "react";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { useGmailAccess } from "../internal/use-gmail-access";
import { GMAIL_BLOCKER_BODY, GmailAccessAction } from "./gmail-access-action";

/**
 * The one "Gmail is not usable yet" surface: a centred message naming the
 * unmet prerequisite (`GMAIL_BLOCKER_BODY`) above the control that resolves it
 * in place (`GmailAccessAction`) — so every Gmail consumer's empty state says
 * the same thing and offers the same fix.
 *
 * While the connection state resolves it shows the loading state, never a
 * blocker it does not know yet. When nothing blocks, it says `whenReady` (what
 * the consumer is still waiting on — e.g. a first sync), with no action.
 */
export function GmailAccessEmptyState({
  title,
  whenReady,
}: {
  /** A heading above the message (a landing names its app). */
  title?: string;
  /** The message when Gmail access is ready. */
  whenReady?: ReactNode;
}): ReactElement {
  const { blocker, loading } = useGmailAccess();
  return (
    <Center axis="both" className="min-h-full">
      {loading ? (
        <Loading variant="spinner" />
      ) : (
        <Stack gap="md" align="center" className="max-w-sm text-center">
          {title !== undefined ? (
            <Text as="h1" variant="heading">
              {title}
            </Text>
          ) : null}
          <Text as="p" variant="body" tone="muted">
            {blocker != null ? GMAIL_BLOCKER_BODY[blocker] : whenReady}
          </Text>
          <GmailAccessAction />
        </Stack>
      )}
    </Center>
  );
}
