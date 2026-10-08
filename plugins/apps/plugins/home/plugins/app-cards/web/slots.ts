import { defineFieldExtensions } from "@plugins/primitives/plugins/data-view/web";
import type { ActiveApp } from "@plugins/apps-core/web";

export const HomeApps = {
  /**
   * Extra `FieldDef<ActiveApp>[]` other plugins fold into the Home app grid
   * (usage stats, …). A contributed field is a full dimension — sortable,
   * filterable, groupable, a column in the table view — while the icons view
   * keeps drawing only the tile and the name.
   */
  Fields: defineFieldExtensions<ActiveApp>(),
};
