import { implement } from "@plugins/infra/plugins/endpoints/server";
import { submitClientSlowOp } from "../../shared/endpoints";
import { recordSlowOp } from "./record-slow-op";

// Client slow-op signals (page-load, element-settle) funnel into the same store
// as server spans, with no parent (client signals have no enclosing span).
export const handleClientSlowOp = implement(
  submitClientSlowOp,
  async ({ body }) => {
    await recordSlowOp({
      operationKind: body.operationKind,
      operation: body.operation,
      durationMs: body.durationMs,
      thresholdMs: body.thresholdMs,
      source: "client-slow-op",
      parent: null,
    });
    return { ok: true };
  },
);
