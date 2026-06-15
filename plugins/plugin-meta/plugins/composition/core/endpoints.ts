import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";
import type { PluginId } from "@plugins/framework/plugins/plugin-id/core";
import type {
  CompositionManifest,
  Edge,
  SerializedEdgeGraph,
} from "@plugins/plugin-meta/plugins/closure/core";

// PluginId is a branded string; over the wire it is just a string. Like
// `pluginTreePayloadSchema` in plugin-view, we validate shape (string) not brand.
const pluginIdSchema = z.custom<PluginId>((v) => typeof v === "string");
const idList = z.array(pluginIdSchema);
const adjacency = z.record(z.string(), idList);

const edgeSchema: z.ZodType<Edge> = z.object({
  from: pluginIdSchema,
  to: pluginIdSchema,
  kind: z.union([z.literal("hard"), z.literal("soft")]),
});

const serializedEdgeGraphSchema: z.ZodType<SerializedEdgeGraph> = z.object({
  hardForward: adjacency,
  hardReverse: adjacency,
  softForward: adjacency,
  softReverse: adjacency,
  subtree: adjacency,
  edges: z.array(edgeSchema),
});

const manifestSchema: z.ZodType<CompositionManifest> = z.object({
  name: z.string(),
  entryPoints: idList,
  selectedContributors: idList,
});

export interface CompositionData {
  graph: SerializedEdgeGraph;
  manifests: CompositionManifest[];
  allIds: PluginId[];
}

export const compositionDataSchema: z.ZodType<CompositionData> = z.object({
  graph: serializedEdgeGraphSchema,
  manifests: z.array(manifestSchema),
  allIds: idList,
});

/**
 * Ships everything Studio needs to run the closure engine client-side: the
 * classified {@link SerializedEdgeGraph}, every declared {@link CompositionManifest},
 * and the full set of plugin ids. The graph is built + classified once per server
 * process (it is an expensive tree build), so this is a read-only introspection
 * endpoint, not a live resource.
 */
export const getCompositionData = defineEndpoint({
  route: "GET /api/composition/data",
  response: compositionDataSchema,
});
