import { rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { databaseExists, dropDatabase } from "@plugins/database/plugins/admin/server";
import { dropZeroReplicationArtifacts } from "@plugins/database/plugins/zero/plugins/cache-service/server";
import {
  ensureMainWorktreeRoot,
  isCanonicalWorktreePath,
  removeWorktree,
  removeWorktreeSpec,
} from "@plugins/infra/plugins/worktree/server";
import { SINGULARITY_DIR } from "@plugins/infra/plugins/paths/server";

export async function dirExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    return false;
  }
}

// The canonical reap sequence shared by the manual delete handlers and the
// automatic reaper job: remove the git worktree (if its dir is still present),
// drop the fork DB, remove the worktree's config dir, and finally remove the
// gateway registry entry (which deregisters the namespace + frees its watch).
//
// `onStep` lets the streaming delete handlers surface per-step progress to the
// UI without duplicating the sequence; the background job passes nothing.
export async function reapAttempt(
  id: string,
  opts: {
    worktreePath?: string;
    onStep?: (step: "worktree" | "database" | "config" | "registry") => void;
  },
): Promise<void> {
  if (opts.worktreePath) {
    const root = await ensureMainWorktreeRoot();
    if (isCanonicalWorktreePath(opts.worktreePath, root) && (await dirExists(opts.worktreePath))) {
      opts.onStep?.("worktree");
      await removeWorktree(opts.worktreePath);
    }
  }

  opts.onStep?.("database");
  // The fork DB may already be gone — an earlier reap dropped it, or a legacy
  // registry-only entry never had one. Guard the DB steps on existence:
  // dropZeroReplicationArtifacts opens a client TO the DB and would throw
  // `database "<id>" does not exist`, aborting the reap before the registry
  // step below and leaving the gateway registration (and its fsnotify watch)
  // anchored forever. When the DB exists, drop Zero's replication slot(s) +
  // publications FIRST: DROP DATABASE WITH (FORCE) terminates backends but does
  // NOT drop replication slots, and a leftover slot makes the drop fail.
  if (await databaseExists(id)) {
    await dropZeroReplicationArtifacts(id);
    await dropDatabase(id);
  }

  opts.onStep?.("config");
  await rm(join(SINGULARITY_DIR, "config", id), { recursive: true, force: true });

  // Deleting the spec file is how the gateway deregisters (its fsnotify Remove
  // handler calls registry.remove()) and frees the worktree's fsnotify watch.
  opts.onStep?.("registry");
  await removeWorktreeSpec(id);
}
