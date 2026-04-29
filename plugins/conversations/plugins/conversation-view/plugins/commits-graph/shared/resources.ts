import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/shared";
import {
  CommitDeltaSchema,
  CommitsGraphSchema,
  type CommitDelta,
  type CommitsGraph,
} from "./protocol";

export const commitDeltaResource = resourceDescriptor<CommitDelta, { attemptId: string }>(
  "commits-graph.delta",
  CommitDeltaSchema,
);

export const commitsGraphResource = resourceDescriptor<CommitsGraph, { attemptId: string }>(
  "commits-graph.graph",
  CommitsGraphSchema,
);
