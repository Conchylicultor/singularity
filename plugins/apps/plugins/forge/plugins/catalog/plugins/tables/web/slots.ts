import { defineDetailSections } from "@plugins/primitives/plugins/detail-sections/web";

export const TableDetail = defineDetailSections<{
  tableName: string;
  pluginId: string;
}>("table-detail");
