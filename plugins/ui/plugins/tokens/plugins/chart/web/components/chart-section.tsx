import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import {
  TokenRows,
  useTokenGroupEditor,
} from "@plugins/ui/plugins/theme-engine/plugins/theme-customizer/web";
import { chartGroup } from "../../core";

const KEYS = Object.keys(chartGroup.schema);

export function ChartSection({ search }: { search: string }) {
  const editor = useTokenGroupEditor(chartGroup);
  if (editor.pending) return <Loading variant="rows" count={KEYS.length} />;
  return (
    <Stack gap="2xs">
      <TokenRows
        editor={editor}
        group={chartGroup}
        keys={KEYS}
        search={search}
      />
    </Stack>
  );
}
