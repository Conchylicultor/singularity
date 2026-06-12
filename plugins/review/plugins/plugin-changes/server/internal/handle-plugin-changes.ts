import { dirname, join, resolve } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { getConversation, listPushesByPushId } from "@plugins/tasks/plugins/tasks-core/server";
import { getEditedFiles } from "@plugins/conversations/plugins/conversation-view/plugins/code/server";
import { resolveParentSha, getRangeFiles } from "@plugins/code-explorer/server";
import { REPO_ROOT, GIT } from "@plugins/infra/plugins/paths/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { getPluginChanges } from "../../core/endpoints";
import { computePluginChanges } from "./compute-plugin-diff";
import type { PluginChangesResponse } from "../../core/protocol";

let cachedMainPluginsDir: string | null = null;
let cachedMainRoot: string | null = null;

async function getMainRoot(): Promise<string> {
  if (cachedMainRoot) return cachedMainRoot;

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
  cachedMainRoot = dirname(absGitDir);
  return cachedMainRoot;
}

async function getMainPluginsDir(): Promise<string> {
  if (cachedMainPluginsDir) return cachedMainPluginsDir;
  cachedMainPluginsDir = join(await getMainRoot(), "plugins");
  return cachedMainPluginsDir;
}

async function extractPluginsAtSha(sha: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), `review-${sha.slice(0, 8)}-`));
  const mainRoot = await getMainRoot();
  const archive = Bun.spawn(
    [GIT, "--no-optional-locks", "-C", mainRoot, "archive", sha, "--", "plugins/"],
    { stdout: "pipe", stderr: "pipe" },
  );
  const tar = Bun.spawn(["tar", "-x", "-C", dir], {
    stdin: archive.stdout,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [archiveCode, tarCode] = await Promise.all([archive.exited, tar.exited]);
  if (archiveCode !== 0 || tarCode !== 0) {
    await rm(dir, { recursive: true, force: true });
    throw new Error(`Failed to extract plugins at ${sha}`);
  }
  return dir;
}

async function handleWorkingTree(conversationId: string): Promise<PluginChangesResponse> {
  const conversation = await getConversation(conversationId);
  if (!conversation?.worktreePath) {
    throw new HttpError(404, "conversation not found");
  }

  const [editedFiles, mainPluginsDir] = await Promise.all([
    getEditedFiles(conversation.worktreePath),
    getMainPluginsDir(),
  ]);

  const worktreePluginsDir = join(conversation.worktreePath, "plugins");
  const plugins = await computePluginChanges(
    worktreePluginsDir,
    mainPluginsDir,
    editedFiles,
  );
  return { plugins };
}

async function handlePush(pushId: string): Promise<PluginChangesResponse> {
  const mainRoot = await getMainRoot();
  const commits = await listPushesByPushId(pushId);
  if (commits.length === 0) {
    throw new HttpError(404, "push not found");
  }

  const earliest = commits[0]!;
  const latest = commits[commits.length - 1]!;
  const baseSha = await resolveParentSha(mainRoot, earliest.sha);
  if (!baseSha) {
    throw new HttpError(400, "could not resolve base SHA");
  }
  const headSha = latest.sha;

  const editedFiles = await getRangeFiles(mainRoot, baseSha, headSha);
  if (!editedFiles) {
    throw new HttpError(500, "failed to compute diff for push range");
  }

  const [baseDir, headDir] = await Promise.all([
    extractPluginsAtSha(baseSha),
    extractPluginsAtSha(headSha),
  ]);

  try {
    const plugins = await computePluginChanges(
      join(headDir, "plugins"),
      join(baseDir, "plugins"),
      editedFiles,
    );
    return { plugins };
  } finally {
    await Promise.all([
      rm(baseDir, { recursive: true, force: true }),
      rm(headDir, { recursive: true, force: true }),
    ]);
  }
}

export const handlePluginChanges = implement(getPluginChanges, async ({ query }) => {
  if (query.pushId) {
    return handlePush(query.pushId);
  }
  return handleWorkingTree(query.conversationId);
});
