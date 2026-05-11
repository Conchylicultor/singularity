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
  { ahead: 0, behind: 0, mergeBase: null, branch: null },
);

export const commitsGraphResource = resourceDescriptor<CommitsGraph, { attemptId: string }>(
  "commits-graph.graph",
  CommitsGraphSchema,
  { ahead: 0, behind: 0, mergeBase: null, branch: null, commits: [], landedCommits: [], behindCommits: [] },
);
