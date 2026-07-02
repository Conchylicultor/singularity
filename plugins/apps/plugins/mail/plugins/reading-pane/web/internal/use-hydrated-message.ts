import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { mailHydrateMessageEndpoint } from "@plugins/apps/plugins/mail/plugins/sync/core";
import type {
  MailMessage,
  MailAttachment,
} from "@plugins/apps/plugins/mail/plugins/mail-core/core";

export interface HydratedMessage {
  message: MailMessage;
  attachments: MailAttachment[];
}

/**
 * On-demand body hydration for one message, keyed by id and cached forever
 * (`staleTime: Infinity`) — a body never changes once fetched, so re-expanding a
 * message is instant. Gated by `enabled` so a collapsed message never fetches.
 * The first expand fetches `format=full` server-side (cache miss); a repeat is a
 * pure Postgres read on the server and a React-Query cache hit on the client.
 */
export function useHydratedMessage(
  messageId: string,
  enabled: boolean,
): UseQueryResult<HydratedMessage> {
  return useQuery({
    queryKey: ["mail-hydrate", messageId],
    enabled,
    staleTime: Infinity,
    queryFn: ({ signal }) =>
      fetchEndpoint(
        mailHydrateMessageEndpoint,
        {},
        { body: { messageId }, signal },
      ),
  });
}
