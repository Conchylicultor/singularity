import { getConversation } from "@plugins/tasks-core/server";
import { getFileContent, getFileContentAtRef } from "./get-file-content";

const GIT = "/usr/bin/git";
const ALLOWED_REFS = new Set(["HEAD", "main"]);

async function resolveRef(worktreePath: string, ref: string): Promise<string> {
  if (ref !== "main") return ref;
  const proc = Bun.spawn(
    [GIT, "-C", worktreePath, "merge-base", "main", "HEAD"],
    { stdout: "pipe", stderr: "pipe" },
  );
  const [out, code] = await Promise.all([
    new Response(proc.stdout).text(),
    proc.exited,
  ]);
  return code === 0 ? out.trim() : ref;
}

export async function handleFileContent(
  req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const id = params.id;
  if (!id) return new Response("Missing id", { status: 400 });

  const url = new URL(req.url);
  const path = url.searchParams.get("path");
  if (!path) return new Response("Missing path", { status: 400 });
  const ref = url.searchParams.get("ref");

  const row = await getConversation(id);
  if (!row) return new Response("Not found", { status: 404 });

  let result;
  if (ref) {
    if (!ALLOWED_REFS.has(ref)) return new Response("Invalid ref", { status: 400 });
    const resolvedRef = await resolveRef(row.worktreePath, ref);
    result = await getFileContentAtRef(row.worktreePath, path, resolvedRef);
  } else {
    result = await getFileContent(row.worktreePath, path);
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
