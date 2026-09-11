import {
  Collapsible,
  CollapsibleContent,
} from "@plugins/primitives/plugins/collapsible/web";
import { SectionHeaderRow } from "@plugins/primitives/plugins/css/plugins/row/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import {
  TokenRows,
  useTokenGroupEditor,
} from "@plugins/ui/plugins/theme-engine/plugins/theme-customizer/web";
import { typeScaleGroup } from "../../core";

const KEYS = Object.keys(typeScaleGroup.schema);

// Every token row filters itself by `search`; whether this section appears at
// all is the contribution's `useAvailable` (`tokenGroupMatchesSearch`).
export function TypeScaleSection({ search }: { search: string }) {
  const editor = useTokenGroupEditor(typeScaleGroup);
  if (editor.pending) return <Loading variant="rows" count={KEYS.length} />;

  return (
    <Stack gap="xs">
      <Collapsible defaultOpen>
        <SectionHeaderRow variant="eyebrow">Tokens</SectionHeaderRow>
        {/* eslint-disable-next-line spacing/no-adhoc-spacing -- indent offset on third-party CollapsibleContent; no padding/gap equivalent */}
        <CollapsibleContent className="ml-2">
          <TokenRows
            editor={editor}
            group={typeScaleGroup}
            keys={KEYS}
            search={search}
          />
        </CollapsibleContent>
      </Collapsible>
    </Stack>
  );
}
