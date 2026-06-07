import { implement } from "@plugins/infra/plugins/endpoints/server";
import { emitLogs } from "../../core/endpoints";
import { Log } from "./log";

export const handleEmit = implement(emitLogs, async ({ body }) => {
  for (const l of body.lines) {
    Log.emit(body.channel, l.line, l.stream, l.t);
  }
});
