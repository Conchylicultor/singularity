import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { TableDetail } from "./slots";

export const tableDetailPane = Pane.define({
  id: "table-detail",
  segment: "t/:pluginId/:tableName",
  component: TableDetailBody,
  width: 600,
});

function TableDetailBody() {
  const { tableName, pluginId } = tableDetailPane.useParams();
  return (
    <PaneChrome pane={tableDetailPane} title={tableName}>
      <TableDetail.Host tableName={tableName} pluginId={pluginId} />
    </PaneChrome>
  );
}
