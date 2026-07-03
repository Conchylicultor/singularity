import { useEffect, useRef, type ReactElement, type ReactNode } from "react";
import { useGmailAccess } from "@plugins/integrations/plugins/gmail/web";
import { navigate } from "@plugins/apps-core/plugins/tabs/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { MAIL_APP_PATH } from "../slots";

/**
 * Mail's index surface (bare `/mail`). It reads the Gmail integration's
 * connection state (never `@plugins/auth` directly) and renders the appropriate
 * empty-state until the mailbox is ready; once ready it redirects to the default
 * mailbox view (`mailboxViewPane`), so the user lands straight in the inbox with
 * the sidebar and thread list rather than a static "connected" card.
 */
export function MailRoot(): ReactElement {
  const { enabled, connected, scopesGranted, loading, ready } = useGmailAccess();

  // Fire the inbox redirect exactly once per mount, on the edge where the
  // mailbox becomes ready. Navigate by URL (not the pane object) so this shell
  // never imports the inbox plugin — `inbox → shell` stays one-way and acyclic.
  // `/mail/mailbox` mounts `inboxPane` as the Miller root exactly like
  // `openPane(inboxPane, {}, { mode: "root" })`.
  const redirected = useRef(false);
  useEffect(() => {
    if (ready && !redirected.current) {
      redirected.current = true;
      navigate(`${MAIL_APP_PATH}/mailbox`);
    }
  }, [ready]);

  if (loading) {
    return (
      <Center axis="both" className="min-h-full">
        <Loading variant="spinner" />
      </Center>
    );
  }

  if (!enabled) {
    return (
      <EmptyState
        title="Mail"
        body="Enable Gmail access in Settings to connect your inbox."
        action={
          <Button variant="outline" onClick={() => navigate("/settings")}>
            Open Settings
          </Button>
        }
      />
    );
  }

  if (!connected) {
    return (
      <EmptyState title="Mail" body="Connect your Google account to use Mail." />
    );
  }

  if (!scopesGranted) {
    return <EmptyState title="Mail" body="Grant Gmail access to continue." />;
  }

  // ready — the effect above swaps the route to the inbox view; show a spinner
  // for the frame before it lands.
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
