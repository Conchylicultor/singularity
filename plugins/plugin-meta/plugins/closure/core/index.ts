export { classifyEdges } from "./classify-edges";
export { resolveComposition, hardClosure } from "./resolve-composition";
export { flattenManifest } from "./flatten-manifest";
export { explainInclusion } from "./explain";
export { impactOfPruning, impactOfSelecting } from "./impact";
export { serializeEdgeGraph, deserializeEdgeGraph } from "./serialize";
export type { SerializedEdgeGraph } from "./serialize";
export type {
  EdgeKind,
  Edge,
  EdgeGraph,
  CompositionManifest,
  MembershipState,
  Composition,
  InclusionStep,
  InclusionPath,
} from "./types";
