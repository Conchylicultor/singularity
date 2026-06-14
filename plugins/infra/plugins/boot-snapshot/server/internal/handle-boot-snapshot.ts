import { implement } from "@plugins/infra/plugins/endpoints/server";
import { loadResourceByKey } from "@plugins/framework/plugins/server-core/core";
import { bootSnapshot } from "../../core";
import { bootCriticalKeys } from "./boot-keys";

// Loads every boot-critical resource in one request so the client hydrates them
// all before first paint. A failed loader is OMITTED from the map (not fatal) —
// `Promise.allSettled` + filter — so one broken resource never bricks the whole
// snapshot; that key falls back to its normal WS sub-ack.
export const handleBootSnapshot = implement(bootSnapshot, async () => {
  const keys = bootCriticalKeys();
  const entries = await Promise.allSettled(
    keys.map(async (k): Promise<[string, unknown]> => [k, await loadResourceByKey(k)]),
  );
  const resources = Object.fromEntries(
    entries.filter((r) => r.status === "fulfilled").map((r) => r.value),
  );
  return { resources };
});
