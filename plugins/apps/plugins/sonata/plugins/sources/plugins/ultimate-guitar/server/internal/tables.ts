import { _songs } from "@plugins/apps/plugins/sonata/plugins/library/server";
import { nullable } from "@plugins/fields/core";
import { intField } from "@plugins/fields/plugins/int/plugins/config/core";
import { textField } from "@plugins/fields/plugins/text/plugins/config/core";
import { defineExtensionShape } from "@plugins/infra/plugins/entity-extensions/core";
import { defineExtension } from "@plugins/infra/plugins/entity-extensions/server";

// This source's persisted data for a song — the full normalized UgTab, attached
// to the library's `sonata_songs` row via the entity-extensions primitive (1:1
// side-table, FK CASCADE on song delete). The persisted columns ARE the UgTab
// fields, so `hydrate` reconstructs the exact `raw` that `compile()` consumes and
// the library schema stays source-agnostic. Table: `sonata_songs_ext_ultimate_guitar`.
//
// We deliberately store the parsed source-of-truth (`content` markup + metadata),
// NOT a cached parse: `parseUgTab` is pure and cheap, so a parsed-cache column
// would only add a staleness footgun (a parser change would serve a stale tree).
//
// The shape is declared here, not in `shared/`: no live resource carries the row
// to the browser. The browser's `UgTab` (`core/raw-tab.ts`) is the fetch client's
// result, read back through `getSongUltimateGuitar`.
const ultimateGuitarShape = defineExtensionShape({
  key: "songId",
  fields: {
    tabId: textField(),
    songName: textField(),
    artistName: textField(),
    type: textField(),
    key: nullable(textField()), // nullable — UG may carry no key
    capo: intField(),
    tuning: textField(),
    content: textField(),
    urlWeb: textField(),
  },
});
export const songUltimateGuitar = defineExtension(
  _songs,
  "ultimate_guitar",
  ultimateGuitarShape,
);
export const _songUltimateGuitarExt = songUltimateGuitar.table; // drizzle-kit discovery
