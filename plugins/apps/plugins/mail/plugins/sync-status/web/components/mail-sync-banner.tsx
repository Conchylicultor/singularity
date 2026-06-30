import type { ReactElement, ReactNode } from "react";
import { MdErrorOutline, MdOpenInNew, MdWarningAmber } from "react-icons/md";
import { navigate } from "@plugins/apps-core/plugins/tabs/web";
import {
  MAIL_SYNC_REMEDIATION,
  type MailSyncErrorCode,
} from "@plugins/apps/plugins/mail/plugins/mail-core/core";
import { mailSyncEndpoint } from "@plugins/apps/plugins/mail/plugins/sync/core";
import { useEndpointMutation } from "@plugins/infra/plugins/endpoints/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Inline } from "@plugins/primitives/plugins/css/plugins/inline/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Spinner } from "@plugins/primitives/plugins/css/plugins/spinner/web";
import { Button, cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { useMailSyncState } from "../internal/use-mail-sync";

/**
 * The Mail app's sync-status banner. Renders a single compact, full-width strip
 * above the mailbox surface for the unhealthy phases and stays out of the way
 * (returns `null`) while everything is fine — the landing pane owns the calm
 * "last synced" line. All copy / remediation comes from the shared
 * `MAIL_SYNC_REMEDIATION` map keyed by the classified error code.
 */
export function MailSyncBanner(): ReactElement | null {
  const { view } = useMailSyncState();

  // Pending, or all-clear: the banner is silent (the landing shows "last synced").
  if (!view || view.phase === "healthy" || view.phase === "idle") return null;

  if (view.phase === "syncing") {
    return (
      <BannerShell
        tone="info"
        icon={<Spinner />}
        title="Syncing your mailbox…"
      />
    );
  }

  // warning | error — both carry a classified error; fall back to "unknown".
  const code: MailSyncErrorCode = view.error?.code ?? "unknown";
  const remediation = MAIL_SYNC_REMEDIATION[code];

  if (view.phase === "warning") {
    return (
      <BannerShell
        tone="warning"
        icon={<MdWarningAmber className="size-4" />}
        title={remediation.title}
        body={remediation.body}
        actions={<RetryButton />}
      />
    );
  }

  // error — terminal until the user acts. Offer the remediation-specific action
  // plus a manual retry.
  const learnMoreUrl = remediation.learnMoreUrl;
  return (
    <BannerShell
      tone="error"
      icon={<MdErrorOutline className="size-4" />}
      title={remediation.title}
      body={remediation.body}
      actions={
        <>
          {remediation.action === "reconnect" ? (
            // Mail never imports `@plugins/auth`; it routes to the Settings app
            // (the same path the connect empty-state uses), where the user
            // reconnects Google from the Accounts surface.
            <Button variant="ghost" onClick={() => navigate("/settings")}>
              Open Settings
            </Button>
          ) : null}
          {remediation.action === "enable-api" && learnMoreUrl ? (
            <Button
              variant="ghost"
              onClick={() => {
                window.open(learnMoreUrl, "_blank", "noopener,noreferrer");
              }}
            >
              Enable Gmail API
              <MdOpenInNew className="size-4" />
            </Button>
          ) : null}
          <RetryButton />
        </>
      }
    />
  );
}

/** "Sync now" trigger. The mutation's global toast surfaces any failure. */
function RetryButton(): ReactElement {
  const sync = useEndpointMutation(mailSyncEndpoint);
  return (
    <Button
      variant="ghost"
      loading={sync.isPending}
      onClick={() => sync.mutate({})}
    >
      Retry now
    </Button>
  );
}

type BannerTone = "info" | "warning" | "error";

// Tonal banner idiom (border-b + `bg-<tone>/10` + `text-<tone>`): a full-width
// strip whose icon/title/body inherit the tone via `currentColor`. `info` stays
// neutral-muted so an in-progress sync reads as calm, not alarming.
const TONE_CLASS: Record<BannerTone, string> = {
  info: "border-border bg-muted/60",
  warning: "border-warning/50 bg-warning/10 text-warning",
  error: "border-destructive/50 bg-destructive/10 text-destructive",
};

function BannerShell({
  tone,
  icon,
  title,
  body,
  actions,
}: {
  tone: BannerTone;
  icon: ReactNode;
  title: ReactNode;
  body?: ReactNode;
  actions?: ReactNode;
}): ReactElement {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("border-b px-md py-sm", TONE_CLASS[tone])}
    >
      <Stack direction="row" gap="sm" align="center">
        {icon}
        <Fill>
          <Stack gap="2xs">
            <Text variant="label">{title}</Text>
            {body != null ? (
              <Text variant="caption">{body}</Text>
            ) : null}
          </Stack>
        </Fill>
        {actions != null ? <Inline gap="xs">{actions}</Inline> : null}
      </Stack>
    </div>
  );
}
