// Test helpers of server-core's core runtime.
//
// The runtime-owned loader → table read-set, read back whole: a suite that
// drives a real loader (through the profiler's ambient entry and the DB pool
// chokepoint) asserts the tables it captured.
export { getReadSetIndex } from "../read-set";

// Relation bases are a process-global holder (`setRelationBases`): a suite
// that installs some resets it after, so the next suite in the same bun process
// still sees the "read before set" throw.
export { clearRelationBases } from "../resources";
