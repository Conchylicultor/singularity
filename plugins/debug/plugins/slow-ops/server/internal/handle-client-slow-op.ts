import { implement } from "@plugins/infra/plugins/endpoints/server";
import { submitClientSlowOp } from "../../shared/endpoints";
import { recordSlowOp } from "./record-slow-op";

// Client slow-op signals (page-load, element-settle) funnel into the same store
// as server spans. They carry no enclosing server span, but the `element` signal
// supplies its own route caller (page-load passes none); forward it through.
export const handleClientSlowOp = implement(
  submitClientSlowOp,
  async ({ body }) => {
    await recordSlowOp({
      operationKind: body.operationKind,
      operation: body.operation,
      durationMs: body.durationMs,
      thresholdMs: body.thresholdMs,
      source: "client-slow-op",
      caller: body.caller ?? null,
    });
    return { ok: true };
  },
);
