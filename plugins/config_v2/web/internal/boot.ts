import { Core } from "@plugins/framework/plugins/web-sdk/core";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { hydrateResource } from "@plugins/primitives/plugins/live-state/web";
import { configSnapshot, configV2Resource } from "@plugins/config_v2/core";
import { setKnownServerPaths } from "./server-paths";
import { setCommittedScopes } from "./committed-scopes";

// Boot-readiness task: fetch every descriptor's resolved global config in one
// request and seed the live-state cache before first paint. After this runs,
// useConfig reads real values synchronously (never `pending`/defaults), so no
// component needs a Suspense fallback. App awaits this; a failure is logged
// there and reads degrade gracefully (the WS sub-ack fills the cache shortly
// after, at the cost of one possible flash).
export const configBootTask = Core.Boot({
  run: async () => {
    const { global, scopes } = await fetchEndpoint(configSnapshot, {});
    for (const [path, values] of Object.entries(global ?? {})) {
      hydrateResource(configV2Resource, { path }, values);
    }
    // Committed git scopes: hydrate their scoped keys so a per-app consumer paints
    // the scoped value on the first frame (no global→scoped flash).
    for (const s of scopes ?? []) {
      hydrateResource(configV2Resource, { path: s.path, scopeId: s.scopeId }, s.values);
    }
    // Record the authoritative server-registered storePaths so useConfig can
    // assert membership and throw loudly on a web-only half-registration.
    // Success path only — a failed boot leaves the set null (graceful degrade).
    setKnownServerPaths(Object.keys(global ?? {}));
    // And the committed-scope set, so useConfig knows which scoped keys to read.
    setCommittedScopes((scopes ?? []).map((s) => ({ path: s.path, scopeId: s.scopeId })));
  },
});
