import { Core } from "@plugins/framework/plugins/web-sdk/core";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { hydrateResource } from "@plugins/primitives/plugins/live-state/web";
import {
  configSnapshot,
  configV2Resource,
  configV2ScopeForkedResource,
} from "@plugins/config_v2/core";
import { readActiveForkedScope } from "./active-scope-storage";

// Pre-paint hydration for the active app's FORKED theme scope. config_v2's own
// boot task seeds the GLOBAL config; this one additionally seeds the scoped
// values + forked-state for the app being (re)loaded, so a hard reload of a
// forked app paints the forked theme on the first frame instead of flashing
// global for one frame (the previously-accepted tradeoff).
//
// The scope to hydrate is read from localStorage (written by ThemeInjector on
// every app switch); see active-scope-storage for why it isn't re-derived here.
// A miss (never-visited fork, fresh browser) degrades to the old one-frame
// flash, then self-heals — strictly better than flashing on every reload.
export const themeScopeBootTask = Core.Boot({
  run: async () => {
    const scopeId = readActiveForkedScope();
    if (!scopeId) return;

    const { scope } = await fetchEndpoint(configSnapshot, {}, { query: { scopeId } });
    if (!scope) return;

    hydrateResource(configV2ScopeForkedResource, { scopeId }, { forked: scope.forked });
    if (!scope.forked) return;
    for (const [path, values] of Object.entries(scope.values)) {
      hydrateResource(configV2Resource, { path, scopeId }, values);
    }
  },
});
