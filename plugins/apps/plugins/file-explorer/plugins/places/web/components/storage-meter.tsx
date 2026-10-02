import type { ReactNode } from "react";
import { useEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { hostFsVolume } from "@plugins/infra/plugins/host-fs/core";
import { Clip } from "@plugins/primitives/plugins/css/plugins/clip/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { formatSize } from "@plugins/apps/plugins/file-explorer/plugins/browser/core";

/**
 * The startup volume's storage, at the foot of the Places sidebar: its name,
 * a used/total bar, and "X GB of Y GB used". Renders nothing until the volume
 * has answered — a meter at zero would claim an empty disk.
 */
export function StorageMeter(): ReactNode {
  const volume = useEndpoint(hostFsVolume, {}, { query: { path: "/" } });
  if (volume.data?.kind !== "ok") return null;
  const { name, total, free } = volume.data;
  const used = Math.max(0, total - free);
  const fraction = total > 0 ? used / total : 0;
  return (
    <Stack gap="xs" className="rail-follow px-sm pt-sm pb-md">
      <Text variant="caption" className="text-muted-foreground">
        {name}
      </Text>
      <Clip
        role="meter"
        aria-label={`${name} storage used`}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={used}
        className="h-1 rounded-full bg-border"
      >
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${(fraction * 100).toFixed(1)}%` }}
        />
      </Clip>
      <Text variant="caption" className="text-muted-foreground">
        {formatSize(used)} of {formatSize(total)} used
      </Text>
    </Stack>
  );
}
