import { useEffect, type ReactElement, type ReactNode } from "react";
import { MdAttachFile } from "react-icons/md";
import { PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { Inset, Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { Cluster } from "@plugins/primitives/plugins/css/plugins/cluster/web";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { RelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import {
  useEndpointMutation,
  getEndpointErrorMessage,
} from "@plugins/infra/plugins/endpoints/web";
import { mailHydrateMessageEndpoint } from "@plugins/apps/plugins/mail/plugins/sync/core";
import type { MailAddress } from "@plugins/apps/plugins/mail/plugins/mail-core/core";
import { mailMessagePane } from "../panes";

function formatAddress(a: MailAddress): string {
  return a.name ? `${a.name} <${a.email}>` : a.email;
}

/**
 * The reader pane for one message. The envelope (subject / from / date) comes
 * from the opener's `input` so the header paints instantly; the full body +
 * attachments are hydrated on mount via `POST /api/mail/hydrate` (idempotent and
 * server cache-first, so re-opening is a pure Postgres hit).
 *
 * `bodyHtml` is deliberately NEVER rendered (XSS / no sanitizer) — only the
 * plain-text alternative is shown. (Follow-up: sanitized HTML rendering,
 * attachment download.)
 */
export function MailMessageBody(): ReactElement {
  const { messageId } = mailMessagePane.useParams();
  const envelope = mailMessagePane.useInput();

  const hydrate = useEndpointMutation(mailHydrateMessageEndpoint, {
    meta: { suppressError: true },
  });

  // `mutate` is a stable reference from react-query, so depending on it re-fires
  // the hydration only when the opened message actually changes.
  const { mutate: hydrateMessage } = hydrate;
  useEffect(() => {
    hydrateMessage({ body: { messageId } });
  }, [messageId, hydrateMessage]);

  // Guard against a stale success/error from a previously-opened message: the
  // response `message.id` equals the requested id, and the mutation's own
  // `variables` carry the id it was fired for.
  const hydrated = hydrate.data?.message.id === messageId ? hydrate.data : null;
  const isErrorForThis =
    hydrate.isError && hydrate.variables?.body?.messageId === messageId;

  const subject = hydrated?.message.subject ?? envelope.subject ?? null;
  const from = hydrated?.message.from ?? envelope.from;
  const to = hydrated?.message.to ?? envelope.to;
  // The endpoint response coerces dates (`z.coerce.date()`), so a hydrated
  // `internalDate` is a real Date. The envelope comes from `useInput()`, which
  // after a reload/back-navigation deserializes from `history.state` JSON — so
  // its date may be a string. Only trust it when it's an actual Date.
  const internalDate =
    hydrated?.message.internalDate ??
    (envelope.internalDate instanceof Date ? envelope.internalDate : null);

  let body: ReactNode;
  if (hydrated) {
    if (hydrated.message.bodyText) {
      body = (
        <Text as="pre" variant="body" className="whitespace-pre-wrap break-words">
          {hydrated.message.bodyText}
        </Text>
      );
    } else if (hydrated.message.bodyHtml) {
      body = <Placeholder tone="muted">Plain-text version unavailable.</Placeholder>;
    } else {
      body = <Placeholder tone="muted">No message body.</Placeholder>;
    }
  } else if (isErrorForThis) {
    body = <Placeholder tone="error">{getEndpointErrorMessage(hydrate.error)}</Placeholder>;
  } else {
    body = <Loading variant="text" label="Loading message…" />;
  }

  return (
    <PaneChrome pane={mailMessagePane} title={subject ?? "Message"}>
      <Inset pad="lg">
        <Stack gap="lg">
          <Stack gap="2xs">
            <Text variant="heading">{subject || "(no subject)"}</Text>
            {from && <Text variant="label">{formatAddress(from)}</Text>}
            {to && to.length > 0 && (
              <Text variant="caption" tone="muted">
                to {to.map((a) => a.name ?? a.email).join(", ")}
              </Text>
            )}
            {internalDate && (
              <Text variant="caption" tone="muted">
                <RelativeTime date={internalDate} />
              </Text>
            )}
          </Stack>
          {hydrated && hydrated.attachments.length > 0 && (
            <Cluster>
              {hydrated.attachments.map((att) => (
                <Badge key={att.id} icon={<MdAttachFile />}>
                  {att.filename}
                </Badge>
              ))}
            </Cluster>
          )}
          {body}
        </Stack>
      </Inset>
    </PaneChrome>
  );
}
