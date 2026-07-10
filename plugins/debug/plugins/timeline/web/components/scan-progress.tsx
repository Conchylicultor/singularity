import type { ReactElement } from "react";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Clip } from "@plugins/primitives/plugins/css/plugins/clip/web";

// Determinate progress for the timeline fan-out (the cluster tab's shape): a
// "scanning X / N" label plus a token-only track whose fill width tracks
// received/total. Before the first `{ total }` frame arrives `total` is null,
// so we show an empty track and a generic label rather than a fake percentage.
export function ScanProgress({
  received,
  total,
}: {
  received: number;
  total: number | null;
}): ReactElement {
  const pct = total ? Math.round((received / total) * 100) : 0;
  return (
    <Stack gap="2xs">
      <Text as="span" variant="caption" tone="muted">
        {total == null
          ? "Scanning sources…"
          : `Scanning sources… ${received} / ${total}`}
      </Text>
      <Clip className="h-1 w-full rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${pct}%` }}
        />
      </Clip>
    </Stack>
  );
}
