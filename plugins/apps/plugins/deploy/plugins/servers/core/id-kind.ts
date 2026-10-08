import { defineIdKind, type IdOf } from "@plugins/ids/core";

/**
 * A deploy server's id (`deploy_servers.id`), declared once (`plugins/ids`).
 * Rows minted as `srv-<ms>-<≤6>` stay recognised.
 */
export const deployServerIdKind = defineIdKind({
  prefix: "srv",
  label: "Deploy server",
});

export type DeployServerId = IdOf<typeof deployServerIdKind>;
