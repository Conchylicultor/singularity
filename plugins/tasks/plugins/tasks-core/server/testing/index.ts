export { installTaskDerivedSchema } from "./install-derived-schema";
// The status batch joined onto a transaction the caller already owns — what lets
// a test drive a batch inside a transaction it will deliberately roll back.
// Shipping code opens its batch with `withTaskStatusBatch`.
export { runStatusBatchOn } from "../internal/status-batch";
// The tree oracle (P8 v3 steps 18–22): a throwaway database with the real
// schema, the real feed and the server-core runtime, the scripted tree
// workload, and a FULL-parity check of every subscribed view after each step.
// Each tree entry's owner registers its real declaration on it.
export {
  canonical,
  createTreeOracle,
  TREE_IDS,
  treeSeed,
  treeSteps,
  withSteps,
} from "./tree-oracle";
export type {
  TreeLoad,
  TreeOracle,
  TreeOracleOptions,
  TreeStep,
  TreeStepCost,
} from "./tree-oracle";
