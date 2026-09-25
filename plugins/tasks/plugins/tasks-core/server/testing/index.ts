export { installTaskDerivedSchema } from "./install-derived-schema";
// The status batch joined onto a transaction the caller already owns — what lets
// a test drive a batch inside a transaction it will deliberately roll back.
// Shipping code opens its batch with `withTaskStatusBatch`.
export { runStatusBatchOn } from "../internal/status-batch";
