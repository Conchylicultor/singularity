import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import {
  TokenRows,
  useTokenGroupEditor,
} from "@plugins/ui/plugins/theme-engine/plugins/theme-customizer/web";
import { categoricalGroup } from "../../core";

const KEYS = Object.keys(categoricalGroup.schema);

export function CategoricalSection({ search }: { search: string }) {
  const editor = useTokenGroupEditor(categoricalGroup);
  if (editor.pending) return <Loading variant="rows" count={KEYS.length} />;
  return (
    <Stack gap="2xs">
      <TokenRows
        editor={editor}
        group={categoricalGroup}
        keys={KEYS}
        search={search}
      />
    </Stack>
  );
}
