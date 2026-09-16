import { join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { listPushesByPushId } from "@plugins/tasks/plugins/tasks-core/server";
import { resolveParentSha, getRangeFiles } from "@plugins/code-explorer/server";
import { GIT } from "@plugins/infra/plugins/paths/server";
import { spawnCaptured } from "@plugins/infra/plugins/spawn/core";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { withHeavyReadSlot } from "@plugins/infra/plugins/host/plugins/host-read-pool/server";
import { buildPluginTree } from "@plugins/plugin-meta/plugins/plugin-tree/core";
import { getPluginChanges } from "../../core/endpoints";
import { computePluginChanges } from "./compute-plugin-diff";
import { getMainRoot } from "./main-plugins-dir";
import type { PluginChangesResponse } from "../../core/protocol";

// Each step serves an open HTTP request and reads only the local repo; a minute
// is far past any useful answer, so only a wedged child reaches it.
const EXTRACT_TIMEOUT_MS = 60_000;

// `git archive -o <file>` then `tar -xf <file>`, never `git archive | tar -x`
// through `Bun.spawn`: Bun relays a child-to-child pipe through JS and can drop
// the stream's tail when the writer exits (the same loss that broke the DB fork).
async function extractPluginsAtSha(sha: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), `review-${sha.slice(0, 8)}-`));
  const mainRoot = await getMainRoot();
  const archivePath = join(dir, "plugins.tar");
  const opts = { timeoutMs: EXTRACT_TIMEOUT_MS };
  const archive = await spawnCaptured(
    [
      GIT,
      "--no-optional-locks",
      "-C",
      mainRoot,
      "archive",
      "-o",
      archivePath,
      sha,
      "--",
      "plugins/",
    ],
    opts,
  );
  const tar =
    archive.exitCode === 0
      ? await spawnCaptured(["tar", "-xf", archivePath, "-C", dir], opts)
      : undefined;
  if (archive.exitCode !== 0 || tar?.exitCode !== 0) {
    await rm(dir, { recursive: true, force: true });
    const detail = tar
      ? `tar: ${tar.stderr}`
      : `git archive: ${archive.stderr}`;
    throw new Error(`Failed to extract plugins at ${sha}: ${detail}`);
  }
  await rm(archivePath);
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
        buildPluginTree(join(headDir, "plugins"), {
          skipBarrelImport: true,
          facets: true,
        }),
        buildPluginTree(join(baseDir, "plugins"), {
          skipBarrelImport: true,
          facets: true,
        }),
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

export const handlePluginChanges = implement(
  getPluginChanges,
  async ({ query }) => {
    return handlePush(query.pushId);
  },
);
