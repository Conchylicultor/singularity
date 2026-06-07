import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";
import type { PluginNode, PluginTreePayload } from "./types";

// Recursive plugin node. `facets` is left loose (z.record of z.unknown) — each
// facet's shape lives in its own `core/` and consumers read `facets[id]` directly
// via a contribution-carried id; modelling every facet here would duplicate those
// types for no parse-safety benefit.
const pluginNodeSchema: z.ZodType<PluginNode> = z.lazy(() =>
  z.object({
    path: z.string(),
    name: z.string(),
    hierarchyId: z.string(),
    description: z.string().optional(),
    loadBearing: z.boolean(),
    collapsed: z.boolean(),
    runtimes: z.object({
      web: z.boolean(),
      server: z.boolean(),
      central: z.boolean(),
    }),
    children: z.array(pluginNodeSchema),
    facets: z.record(z.string(), z.unknown()),
  }),
);

export const pluginTreePayloadSchema: z.ZodType<PluginTreePayload> = z.object({
  plugins: z.array(pluginNodeSchema),
  totals: z.object({
    plugins: z.number(),
    loadBearing: z.number(),
    umbrellas: z.number(),
  }),
});

export const getPluginTree = defineEndpoint({
  route: "GET /api/plugin-view/tree",
  response: pluginTreePayloadSchema,
});
