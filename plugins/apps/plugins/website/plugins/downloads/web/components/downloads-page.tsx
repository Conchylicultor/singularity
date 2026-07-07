import type { ComponentType } from "react";
import {
  MdComputer,
  MdDesktopWindows,
  MdLaptopMac,
} from "react-icons/md";
import { Button, cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack, Inset } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Grid } from "@plugins/primitives/plugins/css/plugins/grid/web";
import { Card } from "@plugins/primitives/plugins/css/plugins/card/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import {
  DOWNLOADS,
  detectPlatform,
  type DownloadEntry,
  type Platform,
} from "../../core";

const PLATFORM_ICON: Record<Platform, ComponentType<{ className?: string }>> = {
  macos: MdLaptopMac,
  linux: MdComputer,
  windows: MdDesktopWindows,
};

/**
 * The downloads page body. A single centered reading column (the same
 * `mx-auto max-w-*` idiom as the Home launcher) with a heading and a
 * responsive grid of one card per platform. `navigator` is client-only in this
 * SPA, so reading it in render is fine.
 */
export function DownloadsPage() {
  const current = detectPlatform(navigator.userAgent);
  return (
    <div className="mx-auto w-full max-w-3xl">
      <Inset pad="2xl">
        <Stack gap="2xl">
          <Stack gap="sm" align="center" className="text-center">
            <Text variant="eyebrow" tone="primary">
              Downloads
            </Text>
            <Text as="h1" variant="title" className="tracking-tight">
              Download equin
            </Text>
            <Text as="p" variant="body" tone="muted">
              Get the desktop app for your platform. Native builds are on the way.
            </Text>
          </Stack>
          <Grid minCellWidth="14rem" gap="lg">
            {DOWNLOADS.map((entry) => (
              <PlatformCard
                key={entry.id}
                entry={entry}
                current={entry.platform === current}
              />
            ))}
          </Grid>
        </Stack>
      </Inset>
    </div>
  );
}

function PlatformCard({
  entry,
  current,
}: {
  entry: DownloadEntry;
  current: boolean;
}) {
  const Icon = PLATFORM_ICON[entry.platform];
  const comingSoon = entry.status === "coming-soon";
  return (
    <Card selected={current}>
      <Stack gap="md" align="center">
        <div className={cn("rounded-xl", current ? "bg-primary/10" : "bg-muted")}>
          <Inset pad="md">
            <Icon
              className={cn(
                "size-8",
                current ? "text-primary" : "text-muted-foreground",
              )}
            />
          </Inset>
        </div>
        <Stack gap="2xs" align="center">
          <Text variant="subheading">{entry.label}</Text>
          {current && (
            <Badge variant="primary" shape="pill">
              For your system
            </Badge>
          )}
        </Stack>
        <Button
          variant={current ? "default" : "outline"}
          disabled={comingSoon}
          onClick={() => window.open(entry.href, "_blank", "noopener")}
        >
          {comingSoon ? "Coming soon" : "Download"}
        </Button>
      </Stack>
    </Card>
  );
}
