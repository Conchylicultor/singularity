import { Core } from "@plugins/framework/plugins/web-sdk/core";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { hydrateResource } from "@plugins/primitives/plugins/live-state/web";
import { bootSnapshot } from "../../core";
import { registeredDescriptors } from "./registry";

// Boot-readiness task: fetch every boot-critical resource in ONE request and
// seed the live-state cache before first paint, so boot-critical resources read
// real data synchronously on the first render (no `pending` flash, no WS
// round-trip). Mirrors config_v2's `Core.Boot` snapshot task.
//
// Scope: param-less GLOBAL resources only (route-parametrized resources are
// excluded — the server can't know the client's params at snapshot time; they
// self-heal via their normal sub-ack, now fast because Phase C warmed their
// tables). Best-effort: a failure (or a key missing from the snapshot because
// its server loader failed) just means the WS sub-ack fills the cache shortly
// after — we never throw and brick boot.
export const bootSnapshotTask = Core.Boot({
  run: async () => {
    const { resources } = await fetchEndpoint(bootSnapshot, {});
    for (const d of registeredDescriptors()) {
      if (d.key in resources) hydrateResource(d, undefined, resources[d.key]);
    }
  },
});
