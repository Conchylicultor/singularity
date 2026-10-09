import {
  usePluginFacetDiffs,
  type FacetDiff,
} from "@plugins/review/plugins/plugin-changes/web";
import type { PluginReviewProps } from "@plugins/review/plugins/plugin-changes/core";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import { rigidClass } from "@plugins/primitives/plugins/css/plugins/rigid/web";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { symbol } from "@plugins/ui/plugins/icons/core";
import { Icon } from "@plugins/ui/plugins/icons/web";

const addIcon = symbol("add");
const removeIcon = symbol("remove");

function DiffSection({
  label,
  diff,
}: {
  label: string;
  diff: FacetDiff["diff"];
}) {
  return (
    <Stack gap="2xs">
      <Text
        as="span"
        variant="caption"
        className="font-medium text-muted-foreground uppercase tracking-wider"
      >
        {label}
      </Text>
      {diff.added.map((item) => (
        <Text as={Line} variant="caption" key={item} className="gap-xs">
          <Icon
            icon={addIcon}
            className={cn("size-3 text-success-text", rigidClass())}
          />
          <code className="text-success-text">{item}</code>
        </Text>
      ))}
      {diff.removed.map((item) => (
        <Text as={Line} variant="caption" key={item} className="gap-xs">
          <Icon
            icon={removeIcon}
            className={cn("size-3 text-destructive-text", rigidClass())}
          />
          <code className="text-destructive-text">{item}</code>
        </Text>
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
