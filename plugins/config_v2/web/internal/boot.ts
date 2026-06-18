import { Core } from "@plugins/framework/plugins/web-sdk/core";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { hydrateResource } from "@plugins/primitives/plugins/live-state/web";
import { configSnapshot, configV2Resource, configV2ScopesResource } from "@plugins/config_v2/core";
import { setKnownServerPaths } from "./server-paths";

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
    // And hydrate the per-path scope LIST (configV2ScopesResource) from the same
    // committed scopes, so useConfig's authoritative scoped decision sees the
    // committed scopeId in the list on the first frame and reads the scoped value
    // above (no global→scoped flash). This push resource is otherwise un-hydrated,
    // so without seeding it the first paint would render global before the WS
    // sub-ack arrives. Runtime forks/plain scoped writes appear via the live
    // resource and need no seeding.
    const byPath = new Map<string, string[]>();
    for (const s of scopes ?? []) byPath.set(s.path, [...(byPath.get(s.path) ?? []), s.scopeId]);
    for (const [path, ids] of byPath) hydrateResource(configV2ScopesResource, { path }, ids);
    // Record the authoritative server-registered storePaths so useConfig can
    // assert membership and throw loudly on a web-only half-registration.
    // Success path only — a failed boot leaves the set null (graceful degrade).
    setKnownServerPaths(Object.keys(global ?? {}));
  },
});
