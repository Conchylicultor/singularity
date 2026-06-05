import { Core } from "@plugins/framework/plugins/web-sdk/core";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { hydrateResource } from "@plugins/primitives/plugins/live-state/web";
import { configSnapshot, configV2Resource } from "@plugins/config_v2/core";

// Boot-readiness task: fetch every descriptor's resolved global config in one
// request and seed the live-state cache before first paint. After this runs,
// useConfig reads real values synchronously (never `pending`/defaults), so no
// component needs a Suspense fallback. App awaits this; a failure is logged
// there and reads degrade gracefully (the WS sub-ack fills the cache shortly
// after, at the cost of one possible flash).
export const configBootTask = Core.Boot({
  run: async () => {
    const snapshot = await fetchEndpoint(configSnapshot, {});
    for (const [path, values] of Object.entries(snapshot)) {
      hydrateResource(configV2Resource, { path }, values);
    }
  },
});
