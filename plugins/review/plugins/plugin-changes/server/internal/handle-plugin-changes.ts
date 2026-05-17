import { dirname, join, resolve } from "node:path";
import { getConversation } from "@plugins/tasks-core/server";
import { getEditedFiles } from "@plugins/conversations/plugins/conversation-view/plugins/code/server";
import { REPO_ROOT, GIT } from "@plugins/infra/plugins/paths/server";
import { computePluginChanges } from "./compute-plugin-diff";
import type { PluginChangesResponse } from "../../core/protocol";

let cachedMainPluginsDir: string | null = null;

async function getMainPluginsDir(): Promise<string> {
  if (cachedMainPluginsDir) return cachedMainPluginsDir;

  const proc = Bun.spawn(
    [GIT, "--no-optional-locks", "rev-parse", "--git-common-dir"],
    { cwd: REPO_ROOT, stdout: "pipe", stderr: "pipe" },
  );
  const [out, code] = await Promise.all([
    new Response(proc.stdout).text(),
    proc.exited,
  ]);
  if (code !== 0) throw new Error("Failed to resolve git common dir");

  const absGitDir = resolve(REPO_ROOT, out.trim());
  const mainRoot = dirname(absGitDir);
  cachedMainPluginsDir = join(mainRoot, "plugins");
  return cachedMainPluginsDir;
}

export async function handlePluginChanges(req: Request): Promise<Response> {
  const url = new URL(req.url, "http://localhost");
  const conversationId = url.searchParams.get("conversationId");
  if (!conversationId) {
    return Response.json({ error: "conversationId required" }, { status: 400 });
  }

  const conversation = await getConversation(conversationId);
  if (!conversation?.worktreePath) {
    return Response.json({ error: "conversation not found" }, { status: 404 });
  }

  const [editedFiles, mainPluginsDir] = await Promise.all([
    getEditedFiles(conversation.worktreePath),
    getMainPluginsDir(),
  ]);

  const worktreePluginsDir = join(conversation.worktreePath, "plugins");
  const plugins = computePluginChanges(
    worktreePluginsDir,
    mainPluginsDir,
    editedFiles,
  );

  const response: PluginChangesResponse = { plugins };
  return Response.json(response);
}
