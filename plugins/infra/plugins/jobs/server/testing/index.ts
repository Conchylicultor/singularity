// Installs graphile-worker's queue schema into a throwaway test database, which
// the fork-based worktree databases exclude — so a suite that enqueues a job
// can run against one.
export { installQueueSchema } from "../internal/queue-schema";
