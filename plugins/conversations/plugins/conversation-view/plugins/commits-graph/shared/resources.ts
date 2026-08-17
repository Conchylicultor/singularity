import {
  resourceDescriptor,
  unresolved,
} from "@plugins/primitives/plugins/live-state/core";
import {
  CommitsGraphPayloadSchema,
  type CommitsGraphPayload,
} from "./protocol";

export const commitsGraphResource = resourceDescriptor<
  CommitsGraphPayload,
  { attemptId: string }
>("commits-graph.graph", CommitsGraphPayloadSchema, unresolved("not loaded"));
