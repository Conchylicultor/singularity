import { implement } from "@plugins/infra/plugins/endpoints/server";
import { captureTrace } from "@plugins/debug/plugins/trace/plugins/engine/server";
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
    // Capture the server-side coherent instant AROUND receipt of this client
    // signal. A slow settle is ~all transport/server wait, so the server window
    // at receipt is exactly the evidence sought; its window is anchored at
    // receipt, not the client moment (documented clock-skew acceptability). The
    // trigger kind is the client operationKind ("page-load" / "element") so it
    // slots into the same open trigger vocabulary as server spans.
    const trace = captureTrace({
      kind: body.operationKind,
      label: body.operation,
      durationMs: body.durationMs,
      thresholdMs: body.thresholdMs,
      detail: {
        caller: body.caller ?? null,
        transportColdStart: body.transportColdStart,
        transportWaitMs: body.transportWaitMs,
      },
    });
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
      traceId: trace?.id,
    });
    return { ok: true };
  },
);
