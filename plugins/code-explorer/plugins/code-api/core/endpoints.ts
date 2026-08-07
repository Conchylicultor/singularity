import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";
import { EditedFileSchema } from "@plugins/conversations/plugins/conversation-view/plugins/code/core";
import { CommitRowSchema } from "@plugins/primitives/plugins/commit-list/core";
import { resolvableSchema } from "@plugins/primitives/plugins/live-state/core";

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

// One commit's metadata. `Resolvable` rather than a bespoke found/not-found
// union: a sha that names no object in this worktree is a *determinate* answer
// ("there is nothing here", with a reason), not a failed read — exactly what
// `Resolvable` means, and what `commits-graph/shared/protocol.ts` already uses
// for the analogous case. A 404 would conflate it with an unknown worktree.
export const getCommitInfo = defineEndpoint({
  route: "GET /api/code/:worktree/commit-info",
  query: z.object({ sha: z.string() }),
  response: resolvableSchema(CommitRowSchema),
});
