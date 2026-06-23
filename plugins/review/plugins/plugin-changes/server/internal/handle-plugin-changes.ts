import { join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { listPushesByPushId } from "@plugins/tasks/plugins/tasks-core/server";
import { resolveParentSha, getRangeFiles } from "@plugins/code-explorer/server";
import { GIT } from "@plugins/infra/plugins/paths/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { withHeavyReadSlot } from "@plugins/infra/plugins/host-read-pool/server";
import { buildPluginTree } from "@plugins/plugin-meta/plugins/plugin-tree/core";
import { getPluginChanges } from "../../core/endpoints";
import { computePluginChanges } from "./compute-plugin-diff";
import { getMainRoot } from "./main-plugins-dir";
import type { PluginChangesResponse } from "../../core/protocol";

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

  return withHeavyReadSlot(async () => {
    const [baseDir, headDir] = await Promise.all([
      extractPluginsAtSha(baseSha),
      extractPluginsAtSha(headSha),
    ]);

    try {
      // base/head are immutable historical shas, but distinct per push range —
      // not worth a memo (unbounded growth). This path is already deduped +
      // concurrency-capped, so just build both trees inside the one slot.
      const [headTree, baseTree] = await Promise.all([
        buildPluginTree(join(headDir, "plugins"), { skipBarrelImport: true }),
        buildPluginTree(join(baseDir, "plugins"), { skipBarrelImport: true }),
      ]);
      const plugins = computePluginChanges(headTree, baseTree, editedFiles);
      return { plugins };
    } finally {
      await Promise.all([
        rm(baseDir, { recursive: true, force: true }),
        rm(headDir, { recursive: true, force: true }),
      ]);
    }
  });
}

export const handlePluginChanges = implement(getPluginChanges, async ({ query }) => {
  return handlePush(query.pushId);
});
