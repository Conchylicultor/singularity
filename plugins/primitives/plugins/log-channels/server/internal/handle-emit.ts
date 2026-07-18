import { implement } from "@plugins/infra/plugins/endpoints/server";
import { emitLogs } from "../../core/endpoints";
import { emitClientLog } from "./client-ingress";

export const handleEmit = implement(emitLogs, async ({ body }) => {
  for (const l of body.lines) {
    emitClientLog(body.channel, l.line, l.stream, l.t);
  }
});
