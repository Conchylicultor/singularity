// Reset a served composition to its genuine first-launch state — a NARROWER
// `reapAttempt` (cf. debug/worktree-cleanup/server/internal/reap.ts). A served
// composition (`autoBuild: true`) is live at http://<id>.localhost:9000 with its
// own DB `<id>` and config dir ~/.singularity/state/config/<id>/. This keeps the spec +
// dist + code (so it stays served) and wipes ONLY that one composition's DB +
// config back to exactly what compose-serve provisions on a fresh serve, then
// restarts the backend — so the author sees the real new-user experience.
//
// Why config is RE-PROPAGATED, not just deleted: a bare `rm -rf` of the config
// dir would fall back to *code* defaults, not a genuine first-launch. Re-running
// propagateConfigToUser restores the shipped *git-layer* defaults compose-serve
// installs (`serveOne` calls the same function), so the reset lands on the exact
// first-launch config, not a code-default approximation.
//
// OUT OF SCOPE — central secrets / auth tokens: they live in one global encrypted
// store (~/.singularity/state/secrets/) shared by every namespace by the
// single-instance-per-user architecture, carry no per-composition dimension, and
// are deliberately untouched here (see research/2026-07-02-global-adr-single-
// instance-per-user.md).
//
// Never touches main: `assertServableCompositionNamespace` rejects the reserved
// {central, singularity, main} namespaces, and three more provenance guards below
// prove the target is a compose-serve-owned namespace before any data is touched.

import { rm } from "node:fs/promises";
import {
  propagateConfigToUser,
  readEffectiveConfigFromDisk,
} from "@plugins/framework/plugins/tooling/plugins/codegen/core";
import { asPath, asPluginId } from "@plugins/framework/plugins/plugin-id/core";
import {
  ensureMainWorktreeRoot,
  hasCompositionMarker,
  namespaceCollision,
  probeNamespace,
} from "@plugins/infra/plugins/worktree/server";
import {
  databaseExists,
  dropDatabase,
  ensureDatabase,
} from "@plugins/database/plugins/admin/server";
import { dropZeroReplicationArtifacts } from "@plugins/database/plugins/zero/plugins/cache-service/server";
import {
  activatedCompositionIds,
  assertServableCompositionNamespace,
  compositionsConfig,
} from "@plugins/plugin-meta/plugins/composition/core";
import { MAIN_WORKTREE_NAME } from "@plugins/infra/plugins/paths/server";
import { configDir } from "@plugins/config_v2/data-dirs";

// The `compositions` config's owning-plugin path — its jsonc files live under
// `config/<this>/` and the per-worktree user config dir (mirrors compose-serve).
const COMPOSITIONS_HIERARCHY_PATH = asPath(
  asPluginId("plugin-meta.composition"),
);

/** A refused reset — a guard rejected the target before any data was touched. */
export class CompositionResetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CompositionResetError";
  }
}

/**
 * Wipe one served composition's DB + config back to its first-launch state, then
 * restart its backend. ALL guards must pass, else throw `CompositionResetError`
 * with nothing touched.
 */
export async function resetCompositionData(id: string): Promise<void> {
  // Guard 1 — the explicit "never main/central" gate (rejects the reserved
  // {central, singularity, main} namespaces and enforces a valid name).
  assertServableCompositionNamespace(id);

  // Guard 2 — the decisive provenance signal: only a compose-serve namespace
  // carries the composition.json marker.
  if (!hasCompositionMarker(id)) {
    throw new CompositionResetError(
      `reset "${id}": no composition.json marker — not a served composition`,
    );
  }

  const root = await ensureMainWorktreeRoot();

  // Guard 3 — no collision with a real git worktree dir, git branch, or a
  // marker-less spec dir of that name.
  const collision = namespaceCollision(id, probeNamespace(root, id));
  if (collision !== null) {
    throw new CompositionResetError(`reset "${id}": ${collision}`);
  }

  // Guard 4 — belt-and-suspenders: `id` must be currently activated
  // (`autoBuild: true`) in MAIN's resolved config. Deactivation sweeps the
  // marker, so guard 2 already implies this; read main-authoritatively,
  // regardless of which backend is executing. `activatedCompositionIds` is the
  // SAME function compose-serve derives its activated set with — this used to
  // hand-roll the `autoBuild` filter, which is how a guard drifts from the stage
  // it is guarding.
  const values = readEffectiveConfigFromDisk(compositionsConfig, {
    root,
    userConfigDir: configDir.file(MAIN_WORKTREE_NAME),
    hierarchyPath: COMPOSITIONS_HIERARCHY_PATH,
  });
  const activated = activatedCompositionIds(values.manifests);
  if (!activated.includes(id)) {
    throw new CompositionResetError(
      `reset "${id}": not an activated (autoBuild) composition in main's config`,
    );
  }

  // Recipe — guards passed; the target is provably this one namespace.
  // Drop + recreate the DB (fresh empty; the backend's boot migrator rebuilds the
  // schema on next spawn). Zero replication artifacts must go before the drop.
  if (await databaseExists(id)) {
    await dropZeroReplicationArtifacts(id);
    await dropDatabase(id);
  }
  await ensureDatabase(id);

  // Wipe the config dir and re-propagate the git-layer first-launch defaults.
  await rm(configDir.file(id), { recursive: true, force: true });
  await propagateConfigToUser({ root, userConfigDir: configDir.file(id) });

  await restartNamespace(id);
}

/**
 * Reboot the composition's backend against the emptied DB. Tolerant, mirroring
 * compose-serve's gateway-notify: resp.ok = restarted; 404 = not running (spawns
 * on first request, fine); a TypeError/DOMException from fetch = the gateway is
 * down (fine — it spawns on first request); anything else is rethrown.
 *
 * Deliberately does NOT call `getAdminPool().end()` — that is a CLI-exit concern;
 * the server's admin pool is long-lived.
 */
async function restartNamespace(id: string): Promise<void> {
  try {
    await fetch(`http://localhost:9000/gateway/worktrees/${id}/restart`, {
      method: "POST",
      signal: AbortSignal.timeout(30_000),
    });
    // resp.ok / 404 / other status are all acceptable outcomes here: the backend
    // will (re)spawn against the fresh DB on the next request regardless.
  } catch (err) {
    if (!(err instanceof TypeError) && !(err instanceof DOMException))
      throw err;
    // Gateway unreachable — the backend spawns on first request; nothing to do.
  }
}
