import type { ActiveApp } from "@plugins/apps-core/web";
import { AppIconTile } from "@plugins/apps-core/plugins/app-icon/web";
import type { FieldDef } from "@plugins/primitives/plugins/data-view/core";

/**
 * An installed app as a DataView row: its tile (the leading field, drawn
 * through `AppIconTile` — the app's colour in `APP_TILE_PALETTE`, filling
 * whatever box the view gives it) and its name. Every DataView of apps — the
 * launcher's grid, the Home gallery — renders these fields, so an app looks
 * the same wherever it is launched from.
 */
export const appFields: FieldDef<ActiveApp>[] = [
  {
    id: "icon",
    label: "Icon",
    leading: true,
    cell: (a) => (
      <AppIconTile icon={a.icon} appId={a.id} className="size-full" />
    ),
  },
  { id: "name", label: "Name", type: "text", value: (a) => a.app.name },
];
