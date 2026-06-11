import { Core } from "@plugins/framework/plugins/web-sdk/core";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { hydrateEndpoint } from "@plugins/primitives/plugins/live-state/web";
import { listTweakcnThemes } from "../core";

// Pre-paint hydration of the tweakcn preset list. GroupStyle (theme-engine)
// resolves the active preset on the first frame; without this task the list
// arrives only after mount, so the PresetSource reports pending and no theme
// styles are injected until it resolves. Hydrating here makes the first
// injection the correct one. Failure degrades gracefully: runBootTasks
// allSettles, the source stays pending, and the pre-paint cached CSS (see
// theme-engine's paint-cache) keeps painting until the endpoint resolves.
export const tweakcnBootTask = Core.Boot({
  run: async () => {
    const data = await fetchEndpoint(listTweakcnThemes, {});
    hydrateEndpoint(listTweakcnThemes, {}, undefined, data);
  },
});
