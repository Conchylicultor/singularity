import { implement } from "@plugins/infra/plugins/endpoints/server";
import { submitClientSlowOp } from "../../shared/endpoints";
import { recordSlowOp } from "./record-slow-op";

// Client slow-op signals (page-load, element-settle) funnel into the same store
// as server spans. They carry no enclosing server span, but the `element` signal
// supplies its own route caller (page-load passes none); forward it through.
export const handleClientSlowOp = implement(
  submitClientSlowOp,
  async ({ body }) => {
    // Charge the transport bring-up wait (element cold-start) to a dedicated
    // wait layer, reusing the durable wait-vs-work primitive (no new column, no
    // migration). This makes the pane's per-op wait breakdown attribute the
    // settle time to transport, not the resource.
    const waits =
      body.transportWaitMs && body.transportWaitMs > 0
        ? { "notifications-transport": body.transportWaitMs }
        : undefined;
    await recordSlowOp({
      operationKind: body.operationKind,
      operation: body.operation,
      durationMs: body.durationMs,
      thresholdMs: body.thresholdMs,
      source: "client-slow-op",
      caller: body.caller ?? null,
      waits,
      transportColdStart: body.transportColdStart,
      transportWaitMs: body.transportWaitMs,
    });
    return { ok: true };
  },
);
