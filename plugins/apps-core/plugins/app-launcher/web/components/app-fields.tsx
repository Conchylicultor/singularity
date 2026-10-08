import type { ActiveApp } from "@plugins/apps-core/web";
import { AppIconAvatar } from "@plugins/apps-core/plugins/app-icon/web";
import type { FieldDef } from "@plugins/primitives/plugins/data-view/core";

/**
 * An installed app as a DataView row: its icon (the leading field, drawn
 * through `AppIconAvatar` — the app's colour in `APP_TILE_PALETTE`; a tile
 * filling the box in a tile view, a badge in rows and table cells) and its
 * name. Every DataView of apps — the launcher's grid, the Home gallery —
 * renders these fields, so an app looks the same wherever it is launched from.
 */
export const appFields: FieldDef<ActiveApp>[] = [
  {
    id: "icon",
    label: "Icon",
    // A glyph column: obvious from its cells, so no header text in a table.
    header: false,
    leading: true,
    cell: (a) => <AppIconAvatar icon={a.icon} appId={a.id} />,
  },
  { id: "name", label: "Name", type: "text", value: (a) => a.app.name },
];
