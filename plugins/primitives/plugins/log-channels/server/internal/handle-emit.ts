import { HttpError, implement } from "@plugins/infra/plugins/endpoints/server";
import { isUnderDuress } from "@plugins/infra/plugins/duress/plugins/latch/server";
import { emitLogs } from "../../core/endpoints";
import { emitClientLogs } from "./client-ingress";

export const handleEmit = implement(emitLogs, ({ body }) => {
  // Backpressure. This is the ONE observability channel whose volume driver is
  // EXTERNAL — a browser that keeps POSTing regardless of host state — so while
  // the box is in trouble the cheapest thing to do is not do the work at all.
  // Rejecting here removes the whole request downstream of the parse: the ring
  // pushes, the file write and the WS fan-out, none of which a sink-level gate
  // would touch. One latch read PER REQUEST, never per line; `isUnderDuress()` is
  // an in-process memo over at most one statSync per 2 s.
  //
  // 429, NOT 503, and this is load-bearing: the client-side endpoint-error
  // reporter files a crash report for every `status >= 500`
  // (reports/plugins/endpoint-errors/web/components/endpoint-error-reporter.tsx).
  // A 503 would therefore make every rejected POST file a "server error" report
  // DURING duress — a self-inflicted report storm set off by the very mechanism
  // that exists to suppress storms. Do not "upgrade" this status.
  //
  // Nothing is lost: the browser re-queues the batch in order and retries (see
  // web/client-log.ts).
  if (isUnderDuress()) {
    throw new HttpError(
      429,
      "Host under duress — log ingress paused; retry later.",
    );
  }
  emitClientLogs(body);
});
