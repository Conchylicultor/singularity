import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";
import { EditedFileSchema } from "@plugins/conversations/plugins/conversation-view/plugins/code/core";

export const getCodeTree = defineEndpoint({
  route: "GET /api/code/:worktree/tree",
  response: z.object({ files: z.array(z.string()) }),
});

export const getFileContent = defineEndpoint({
  route: "GET /api/code/:worktree/file",
  query: z.object({
    path: z.string(),
    ref: z.string().optional(),
  }),
  response: z.object({ content: z.string() }),
});

export const getFileDiff = defineEndpoint({
  route: "GET /api/code/:worktree/diff",
  query: z.object({
    path: z.string(),
    base: z.string().optional(),
    head: z.string().optional(),
    from: z.string().optional(),
  }),
  response: z.object({ diff: z.string() }),
});

// Returns binary image data — not wrapped with implement()
export const getImageContent = defineEndpoint({
  route: "GET /api/code/:worktree/image",
});

export const getPushFiles = defineEndpoint({
  route: "GET /api/code/:worktree/push",
  query: z.object({ pushId: z.string() }),
  response: z.object({
    files: z.array(EditedFileSchema),
    baseSha: z.string(),
    headSha: z.string(),
  }),
});

export const getCommitFiles = defineEndpoint({
  route: "GET /api/code/:worktree/commit",
  query: z.object({ sha: z.string() }),
  response: z.object({
    files: z.array(EditedFileSchema),
    baseSha: z.string(),
    headSha: z.string(),
  }),
});
