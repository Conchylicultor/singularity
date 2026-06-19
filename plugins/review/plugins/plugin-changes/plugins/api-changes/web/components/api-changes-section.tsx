import { MdAdd, MdRemove } from "react-icons/md";
import {
  usePluginFacetDiffs,
  type FacetDiff,
} from "@plugins/review/plugins/plugin-changes/web";
import type { PluginReviewProps } from "@plugins/review/plugins/plugin-changes/core";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Frame } from "@plugins/primitives/plugins/css/plugins/frame/web";

function DiffSection({ label, diff }: { label: string; diff: FacetDiff["diff"] }) {
  return (
    <Stack gap="2xs">
      <Text as="span" variant="caption" className="font-medium text-muted-foreground uppercase tracking-wider">
        {label}
      </Text>
      {diff.added.map((item) => (
        <Frame
          key={item}
          gap="xs"
          leading={<MdAdd className="size-3 text-success" />}
          content={<Text as="code" variant="caption" className="text-success">{item}</Text>}
        />
      ))}
      {diff.removed.map((item) => (
        <Frame
          key={item}
          gap="xs"
          leading={<MdRemove className="size-3 text-destructive" />}
          content={<Text as="code" variant="caption" className="text-destructive">{item}</Text>}
        />
      ))}
    </Stack>
  );
}

export function ApiChangesSection({ plugin }: PluginReviewProps) {
  const facetDiffs = usePluginFacetDiffs(plugin);
  if (facetDiffs.length === 0) return null;
  return (
    <Stack gap="md">
      {facetDiffs.map((fd) => (
        <DiffSection key={fd.facetId} label={fd.label} diff={fd.diff} />
      ))}
    </Stack>
  );
}
