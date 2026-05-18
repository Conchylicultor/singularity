import { getProfilingData } from "@plugins/framework/plugins/server-core/core";
import { implement } from "@plugins/infra/plugins/endpoints/server";
import { getBootProfiling } from "../../shared/endpoints";

export const handleBootProfiling = implement(getBootProfiling, () => {
  const server = getProfilingData();
  return {
    spans: server.spans,
    totalMs: server.totalDurationMs,
  };
});
