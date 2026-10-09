import { defineIdKind, type IdOf } from "@plugins/ids/core";

/**
 * One browser visit (`browser_history.id`), declared once (`plugins/ids`). A
 * `uuid` kind — a visit is written on every navigation, never named by a
 * person. `legacyBareUuid`: the bare-uuid rows were prefixed (`bhist-<uuid>`)
 * by a data migration.
 */
export const browserVisitIdKind = defineIdKind({
  prefix: "bhist",
  label: "Browser visit",
  shape: "uuid",
  legacyBareUuid: true,
});

export type BrowserVisitId = IdOf<typeof browserVisitIdKind>;
