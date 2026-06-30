/**
 * Pure, dependency-free templating helpers shared by workflow step executors.
 * A core-only leaf library — no default export, no plugin definition. The
 * implementation lives in the sibling `./templating` file (barrels re-export
 * only).
 */
export { getByPath, interpolate } from "./templating";
