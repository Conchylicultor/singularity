import { useEffect, useRef, type ReactElement, type ReactNode } from "react";
import {
  useGmailAccess,
  GmailAccessAction,
  GMAIL_BLOCKER_BODY,
} from "@plugins/integrations/plugins/gmail/web";
import { navigate } from "@plugins/apps-core/plugins/tabs/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { MAIL_APP_PATH } from "../slots";

/**
 * Mail's index surface (bare `/mail`). It reads the Gmail integration's
 * connection state (never `@plugins/auth` directly) and renders the appropriate
 * empty-state until the mailbox is ready; once ready it redirects to the threads
 * surface, so the user lands straight in the mailbox rather than on a static
 * "connected" card.
 */
export function MailRoot(): ReactElement {
  const { blocker, loading, ready } = useGmailAccess();

  // Fire the mailbox redirect exactly once per mount, on the edge where the
  // mailbox becomes ready. Navigate by URL LITERAL (not the pane object) so this
  // shell never imports the threads plugin — `threads → shell` stays one-way and
  // acyclic. `/mail/threads` mounts `mailThreadsPane` as the Miller root exactly
  // like `openPane(mailThreadsPane, {}, { mode: "root" })`; which mailbox opens
  // there is the DataView's own tab selection, not part of the URL.
  const redirected = useRef(false);
  useEffect(() => {
    if (ready && !redirected.current) {
      redirected.current = true;
      navigate(`${MAIL_APP_PATH}/threads`);
    }
  }, [ready]);

  if (loading) {
    return (
      <Center axis="both" className="min-h-full">
        <Loading variant="spinner" />
      </Center>
    );
  }

  // One empty state for every unmet prerequisite: the integration names the
  // blocker, supplies its copy, and renders the control that resolves it right
  // here — so the landing is never a dead end telling the user to go and find
  // the fix in Settings themselves.
  if (blocker != null) {
    return (
      <EmptyState
        title="Mail"
        body={GMAIL_BLOCKER_BODY[blocker]}
        action={<GmailAccessAction />}
      />
    );
  }

  // ready — the effect above swaps the route to the threads surface; show a
  // spinner for the frame before it lands.
  return (
    <Center axis="both" className="min-h-full">
      <Loading variant="spinner" />
    </Center>
  );
}

function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: ReactNode;
  action?: ReactNode;
}): ReactElement {
  return (
    <Center axis="both" className="min-h-full">
      <Stack gap="md" align="center" className="max-w-sm text-center">
        <Text as="h1" variant="heading">
          {title}
        </Text>
        <Text as="p" variant="body" tone="muted">
          {body}
        </Text>
        {action}
      </Stack>
    </Center>
  );
}
