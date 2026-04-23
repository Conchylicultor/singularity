import { getFileContent, getFileContentAtRef } from "./get-file-content";
import { ALLOWED_REFS, resolveRef } from "./resolve-ref";
import { resolveWorktreePath } from "./resolve-worktree-path";

export async function handleFileContent(
  req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const worktree = params.worktree;
  if (!worktree) return new Response("Missing worktree", { status: 400 });

  const url = new URL(req.url);
  const path = url.searchParams.get("path");
  if (!path) return new Response("Missing path", { status: 400 });
  const ref = url.searchParams.get("ref");

  const wtPath = await resolveWorktreePath(worktree);
  if (!wtPath) return new Response("Not found", { status: 404 });

  let result;
  if (ref) {
    if (!ALLOWED_REFS.has(ref)) return new Response("Invalid ref", { status: 400 });
    const resolvedRef = await resolveRef(wtPath, ref);
    result = await getFileContentAtRef(wtPath, path, resolvedRef);
  } else {
    result = await getFileContent(wtPath, path);
  }

  switch (result.kind) {
    case "invalid-path":
      return new Response("Invalid path", { status: 400 });
    case "not-found":
      return new Response("File not found", { status: 404 });
    case "too-large":
      return Response.json(
        { error: "too-large", size: result.size },
        { status: 413 },
      );
    case "binary":
      return Response.json({ error: "binary" }, { status: 415 });
    case "ok":
      return Response.json({ content: result.content });
  }
}
