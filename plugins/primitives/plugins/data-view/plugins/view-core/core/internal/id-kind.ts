import { defineIdKind, type IdOf } from "@plugins/ids/core";

/**
 * A named view instance's id (a `views` config row), declared once
 * (`plugins/ids`). `uuid`-shaped: minted client-side for the optimistic row.
 * Rows minted as `view-<uuid>` stay recognised; the normalizer's fallbacks
 * (a slug of the name, `view-<n>`) are not ids of the kind and never were.
 */
export const viewIdKind = defineIdKind({
  prefix: "view",
  label: "Data view",
  shape: "uuid",
});

export type ViewId = IdOf<typeof viewIdKind>;
