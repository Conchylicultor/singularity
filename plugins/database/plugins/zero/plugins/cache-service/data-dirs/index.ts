import { defineDataDir } from "@plugins/infra/plugins/paths/core";

/**
 * zero-cache's local SQLite replica of the upstream Postgres DB. zero-cache owns
 * the file and rebuilds it by an initial COPY on first start.
 */
export const zeroReplicaDir = defineDataDir({
  kind: "services",
  name: "zero",
  owner: "database/zero/cache-service",
  description:
    "zero-cache's SQLite replica of the upstream Postgres DB (replica.db), rebuilt by an initial COPY on first start",
  // Deleting the replica while zero-cache holds it open corrupts a live service;
  // once it is stopped the replica re-COPIES from upstream, so nothing is lost.
  reclaim: { kind: "restart" },
  // PERMANENT, not a to-do. The replica is live state of a running sidecar
  // process, and the gateway hands zero-cache this path at spawn.
  legacyLocation: {
    path: "zero",
    reason:
      "a live replica held open by the running zero-cache sidecar; moving it means stopping that service",
  },
});

/**
 * The vendored Node runtime zero-cache runs under, one directory per pinned
 * version (`<version>/bin/node`). Downloaded and checksum-verified by
 * `scripts/ensure-zero-node.ts`, resolved by `scripts/start.ts`.
 */
export const zeroNodeDir = defineDataDir({
  kind: "services",
  name: "node",
  owner: "database/zero/cache-service",
  description:
    "The vendored Node runtime zero-cache runs under, one directory per pinned version — downloaded and checksum-verified at install time",
  // Re-downloadable, but only with network access, and pulling it out from
  // under a running zero-cache kills the sidecar.
  reclaim: { kind: "restart" },
  // PERMANENT, not a to-do. It is the interpreter of a running service, resolved
  // by the start script the gateway supervises.
  legacyLocation: {
    path: "node",
    reason:
      "the interpreter binary of the running zero-cache sidecar; moving it means stopping that service",
  },
});

export default [zeroReplicaDir, zeroNodeDir];
