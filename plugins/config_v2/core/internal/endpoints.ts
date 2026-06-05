import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";
import { configV2ValuesSchema } from "./resource";

// One-shot snapshot fetched at boot to hydrate the client cache before first
// paint, so config reads never flash defaults and never suspend.
//
// - Without `scopeId`: every descriptor's resolved GLOBAL (no-scope) config,
//   keyed by storePath (`global`). The config_v2 boot task seeds this.
// - With `scopeId`: just that scope's forked-state and — when forked — its
//   resolved scoped values for the `scope: "app"` descriptors (`scope`). The
//   theme-engine boot task seeds this so a hard reload of a forked app paints
//   the forked theme on the first frame instead of flashing global. `global` is
//   omitted in this mode since the config_v2 task fetches it unconditionally;
//   each boot task fetches only what it hydrates.
export const configSnapshot = defineEndpoint({
  route: "GET /api/config-v2/snapshot",
  query: z.object({ scopeId: z.string().optional() }),
  response: z.object({
    global: z.record(configV2ValuesSchema).optional(),
    scope: z
      .object({
        scopeId: z.string(),
        forked: z.boolean(),
        values: z.record(configV2ValuesSchema),
      })
      .optional(),
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
