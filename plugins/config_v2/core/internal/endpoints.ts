import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";
import { configV2ValuesSchema } from "./resource";

// One-shot snapshot fetched at boot to hydrate the client cache before first
// paint, so config reads never flash defaults and never suspend.
//
// `global` is every descriptor's resolved GLOBAL (no-scope) config, keyed by
// storePath. `scopes` is every USER-LAYER scope with its own config (a committed
// git scope, a runtime fork, OR a plain scoped write) — the same predicate the
// live `configV2ScopesResource` uses, so a warm reload of any app with its own
// theme paints scoped on the first frame. The config_v2 boot task hydrates both.
export const configSnapshot = defineEndpoint({
  route: "GET /api/config-v2/snapshot",
  response: z.object({
    global: z.record(configV2ValuesSchema),
    scopes: z.array(
      z.object({
        scopeId: z.string(),
        path: z.string(),
        values: configV2ValuesSchema,
      }),
    ),
  }),
});

export const setConfigField = defineEndpoint({
  route: "POST /api/config-v2/set-field",
  body: z.object({ storePath: z.string(), key: z.string(), value: z.unknown(), scopeId: z.string().optional() }),
});

export const forkScope = defineEndpoint({
  route: "POST /api/config-v2/fork-scope",
  body: z.object({ scopeId: z.string() }),
});

export const deleteScope = defineEndpoint({
  route: "POST /api/config-v2/delete-scope",
  body: z.object({ scopeId: z.string() }),
});

// Per-descriptor scope primitives (single descriptor × scope), distinct from
// fork-scope/delete-scope which act over the whole `scope: "app"` set. Used by
// the settings detail pane to add / stop a per-app customization for one
// descriptor.
export const forkDescriptorScope = defineEndpoint({
  route: "POST /api/config-v2/fork-descriptor-scope",
  body: z.object({ storePath: z.string(), scopeId: z.string() }),
});

export const removeDescriptorScope = defineEndpoint({
  route: "POST /api/config-v2/remove-descriptor-scope",
  body: z.object({ storePath: z.string(), scopeId: z.string() }),
});
