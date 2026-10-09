import { defineIdKind, type IdOf } from "@plugins/ids/core";

/**
 * One stored version of an entity (`entity_versions.id`), declared once
 * (`plugins/ids`). A `uuid` kind, minted by `recordVersion` on every snapshot.
 * `legacyBareUuid`: the bare-uuid rows were prefixed (`ver-<uuid>`) by a data
 * migration, and `key` upgrades a bare uuid in a stale client's request.
 */
export const versionIdKind = defineIdKind({
  prefix: "ver",
  label: "Version",
  shape: "uuid",
  legacyBareUuid: true,
});

export type VersionId = IdOf<typeof versionIdKind>;
