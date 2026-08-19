import type { ReactNode } from "react";
import { MdOpenInNew, MdPlace, MdRefresh } from "react-icons/md";
import { Card } from "@plugins/primitives/plugins/css/plugins/card/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { Cluster } from "@plugins/primitives/plugins/css/plugins/cluster/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Pin } from "@plugins/primitives/plugins/css/plugins/pin/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { rigidClass } from "@plugins/primitives/plugins/css/plugins/rigid/web";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import {
  hoverRevealGroup,
  hoverRevealTarget,
} from "@plugins/primitives/plugins/hover-reveal/web";
import type { PlaceData } from "../../core";
import type { PlaceProviderContribution } from "../slots";

export interface PlaceCardProps {
  data: PlaceData;
  /**
   * The provider's web contribution, when one is registered for
   * `data.providerId`. Absent is a real state — a page can outlive the plugin
   * that filled it — and the card degrades to a generic link label rather than
   * refusing to render a place it already holds.
   */
  provider?: PlaceProviderContribution;
  /** Rendered under the body: the refresh error, when a refresh failed. */
  notice?: ReactNode;
  /** Clear the block back to its search box. */
  onReplace: () => void;
}

/** The resolved place: what the block looks like once it names somewhere. */
export function PlaceCard({
  data,
  provider,
  notice,
  onReplace,
}: PlaceCardProps) {
  const Icon = provider?.icon ?? MdPlace;
  const linkLabel = provider ? `Open in ${provider.label}` : "Open map";

  return (
    <div className={cn(hoverRevealGroup, "relative")}>
      <Card>
        <Stack gap="2xs">
          <Line>
            <Icon
              className={cn(rigidClass(), "size-4 text-muted-foreground")}
            />
            <Fill>
              <Text variant="label">{data.name}</Text>
            </Fill>
          </Line>
          {data.address ? (
            <Text variant="caption" tone="muted">
              {data.address}
            </Text>
          ) : null}
          {data.category || data.mapsUrl ? (
            <Cluster align="center">
              {data.category ? <Badge>{data.category}</Badge> : null}
              {data.mapsUrl ? (
                <Badge
                  as="a"
                  href={data.mapsUrl}
                  target="_blank"
                  rel="noreferrer"
                  icon={<MdOpenInNew className="icon-auto" />}
                  colorClass="bg-muted text-primary hover:bg-muted/80 hover:underline"
                >
                  {linkLabel}
                </Badge>
              ) : null}
            </Cluster>
          ) : null}
          {notice}
          {provider?.attribution ? (
            <Text variant="caption" tone="muted">
              {provider.attribution}
            </Text>
          ) : null}
        </Stack>
      </Card>
      <Pin to="top-right" offset="xs">
        <button
          type="button"
          aria-label="Replace place"
          onClick={onReplace}
          className={cn(
            hoverRevealTarget,
            "size-6 rounded-full bg-black/50 text-white hover:bg-black/70",
          )}
        >
          <Center className="size-full">
            <MdRefresh className="size-4" />
          </Center>
        </button>
      </Pin>
    </div>
  );
}
