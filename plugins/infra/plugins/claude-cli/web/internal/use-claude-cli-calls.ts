import type { UseQueryResult } from "@tanstack/react-query";
import { useEndpoint } from "@plugins/infra/plugins/endpoints/web";
import {
  listClaudeCliCallsFor,
  type ClaudeCliCallsResult,
} from "../../core/endpoints";

/**
 * The model calls recorded for one domain record, oldest first.
 *
 * Pass `occurredAt` (when the record itself happened) whenever you have it: it is
 * the only thing that lets the server tell `not-retained` from `none`. Omit it and
 * an aged-out call is indistinguishable from one that was never made, and the UI
 * will confidently say the wrong thing.
 *
 * Render every arm of the result. A consumer that only handles `calls` has
 * re-introduced the collapse the discriminated union exists to prevent.
 */
export function useClaudeCliCalls(args: {
  correlationId: string;
  occurredAt?: Date;
}): UseQueryResult<ClaudeCliCallsResult> {
  return useEndpoint(
    listClaudeCliCallsFor,
    {},
    { query: { correlationId: args.correlationId, occurredAt: args.occurredAt } },
  );
}
