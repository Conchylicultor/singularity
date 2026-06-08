import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

export const getBuildProfiling = defineEndpoint({
  route: "GET /api/debug/profiling/build",
});

export const getBuildRunProfileByWorktree = defineEndpoint({
  route: "GET /api/debug/profiling/build/:worktree/:buildId",
});
