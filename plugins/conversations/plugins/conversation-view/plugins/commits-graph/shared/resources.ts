import { resourceDescriptor, unresolved } from "@plugins/primitives/plugins/live-state/core";
import {
  CommitDeltaPayloadSchema,
  CommitsGraphPayloadSchema,
  type CommitDeltaPayload,
  type CommitsGraphPayload,
} from "./protocol";

export const commitDeltaResource = resourceDescriptor<CommitDeltaPayload, { attemptId: string }>(
  "commits-graph.delta",
  CommitDeltaPayloadSchema,
  unresolved("not loaded"),
);

export const commitsGraphResource = resourceDescriptor<CommitsGraphPayload, { attemptId: string }>(
  "commits-graph.graph",
  CommitsGraphPayloadSchema,
  unresolved("not loaded"),
);
