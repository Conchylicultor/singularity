// Runtime-agnostic half of the worktree plugin. NOTHING here may import `node:*`
// or the sibling `server/` tree — browser code (the profiling Gantt, the op detail
// pane) imports this barrel to read the branch convention.
export {
  attemptBranchName,
  attemptBranchRef,
  stripAttemptBranchPrefix,
} from "./internal/branch";
