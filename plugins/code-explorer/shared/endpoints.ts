import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

export const getCodeTree = defineEndpoint({
  route: "GET /api/code/:worktree/tree",
});

export const getFileContent = defineEndpoint({
  route: "GET /api/code/:worktree/file",
});

export const getFileDiff = defineEndpoint({
  route: "GET /api/code/:worktree/diff",
});

// Returns binary image data — not wrapped with implement()
export const getImageContent = defineEndpoint({
  route: "GET /api/code/:worktree/image",
});

export const getPushFiles = defineEndpoint({
  route: "GET /api/code/:worktree/push",
});

export const getCommitFiles = defineEndpoint({
  route: "GET /api/code/:worktree/commit",
});
