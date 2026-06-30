import { type ReactElement, type ReactNode } from "react";
import { useGmailAccess } from "@plugins/integrations/plugins/gmail/web";
import { navigate } from "@plugins/apps-core/plugins/tabs/web";
import {
  deriveMailSyncView,
  mailSyncStateResource,
} from "@plugins/apps/plugins/mail/plugins/mail-core/core";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { RelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";

/**
 * Mail's capability-driven landing surface. It reads the Gmail integration's
 * connection state (never touches `@plugins/auth` directly) and renders the
 * appropriate empty-state. The inbox itself lands in a later phase; until then
 * this pane explains exactly what the user must do to connect.
 */
export function MailRoot(): ReactElement {
  const { enabled, connected, scopesGranted, loading } = useGmailAccess();

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
      <EmptyState
        title="Mail"
        body="Connect your Google account to use Mail."
      />
    );
  }

  if (!scopesGranted) {
    return (
      <EmptyState
        title="Mail"
        body="Grant Gmail access to continue."
      />
    );
  }

  // ready
  return <ReadyLanding />;
}

/**
 * The connected/ready landing. Reads the live sync state and shows when the
 * mailbox last synced; the `Mail.Banner` strip (above the surface) owns
 * surfacing in-progress / failed syncs, so this stays a calm "all good" line.
 */
function ReadyLanding(): ReactElement {
  const sync = useResource(mailSyncStateResource);
  if (sync.pending) {
    return <EmptyState title="Mail is connected." body="Checking your mailbox…" />;
  }

  const lastSyncedAt = deriveMailSyncView(sync.data).lastSyncedAt;
  return (
    <EmptyState
      title="Mail is connected."
      body={
        lastSyncedAt ? (
          <>
            Synced <RelativeTime date={new Date(lastSyncedAt)} />.
          </>
        ) : (
          "Waiting for your first sync…"
        )
      }
    />
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
