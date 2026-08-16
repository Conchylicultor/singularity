import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { studioApp } from "@plugins/apps/plugins/studio/plugins/shell/core";
import { TableDetail } from "./slots";

export const tableDetailPane = Pane.define({
  id: "table-detail",
  app: studioApp,
  segment: "t/:pluginId/:tableName",
  component: TableDetailBody,
  width: 600,
  resolve: false,
});

function TableDetailBody() {
  const { tableName, pluginId } = tableDetailPane.useParams();
  return (
    <PaneChrome pane={tableDetailPane} title={tableName}>
      <TableDetail.Host tableName={tableName} pluginId={pluginId} />
    </PaneChrome>
  );
}
