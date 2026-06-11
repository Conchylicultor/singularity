import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { getFileContent as getFileContentEndpoint } from "@plugins/code-explorer/plugins/code-api/core";
import { getFileContent, getFileContentAtRef } from "./get-file-content";
import { ALLOWED_REFS, resolveRef } from "./resolve-ref";
import { resolveWorktreePath } from "./resolve-worktree-path";

export const handleFileContent = implement(getFileContentEndpoint, async ({ params, req }) => {
  const { worktree } = params;
  if (!worktree) throw new HttpError(400, "Missing worktree");

  const url = new URL(req.url);
  const path = url.searchParams.get("path");
  if (!path) throw new HttpError(400, "Missing path");
  const ref = url.searchParams.get("ref");

  const wtPath = await resolveWorktreePath(worktree);
  if (!wtPath) throw new HttpError(404, "Not found");

  let result;
  if (ref) {
    if (!ALLOWED_REFS.has(ref)) throw new HttpError(400, "Invalid ref");
    const resolvedRef = await resolveRef(wtPath, ref);
    result = await getFileContentAtRef(wtPath, path, resolvedRef);
  } else {
    result = await getFileContent(wtPath, path);
  }

  switch (result.kind) {
    case "invalid-path":
      throw new HttpError(400, "Invalid path");
    case "not-found":
      throw new HttpError(404, "File not found");
    case "too-large":
      throw new HttpError(413, "File too large");
    case "binary":
      throw new HttpError(415, "Binary file");
    case "ok":
      return { content: result.content };
  }
});
