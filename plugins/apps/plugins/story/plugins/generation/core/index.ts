// Lifecycle of a single generated unit. Format-agnostic: the engine knows
// nothing about blog/markdown/slides — only that a unit is being generated,
// is ready, or failed.
export type GenStatus = "generating" | "ready" | "error";
