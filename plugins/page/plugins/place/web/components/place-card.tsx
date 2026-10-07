import { Row } from "@plugins/primitives/plugins/css/plugins/row/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Spinner } from "@plugins/primitives/plugins/css/plugins/spinner/web";
import { rigidClass } from "@plugins/primitives/plugins/css/plugins/rigid/web";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import {
  Avatar,
  AvatarPresentationProvider,
} from "@plugins/primitives/plugins/avatar/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { useCopyToClipboard } from "@plugins/primitives/plugins/copy-to-clipboard/web";
import { symbol } from "@plugins/ui/plugins/icons/core";
import type { PlaceData } from "../../core";
import { placeFamilyFill } from "../internal/family-fill";
import { placeKindGlyph } from "../internal/kind-glyphs";

const copyIcon = symbol("content-copy");

const checkIcon = symbol("check");
const refreshIcon = symbol("refresh");
const replaceIcon = symbol("edit-location-alt");

/** The refresh of an already-rendered snapshot, as the card shows it. */
export interface PlaceCardRefresh {
  refreshing: boolean;
  /** The provider's reason the last refresh failed, or null. */
  error: string | null;
  /** Ask the provider again now. */
  refresh: () => void;
}

export interface PlaceCardProps {
  data: PlaceData;
  refresh: PlaceCardRefresh;
  /** Clear the block back to its search box. */
  onReplace: () => void;
}

/**
 * The resolved place: one row — a circle whose glyph says what KIND of place
 * it is and whose colour says its FAMILY (the provider's category), the name, and `category · address`. The whole row opens the
 * provider's page; refresh, copy-address and replace are hover actions. No provider
 * name, no badge: the link is the row.
 */
export function PlaceCard({ data, refresh, onReplace }: PlaceCardProps) {
  const address = data.address ?? "";
  const { copy, copied } = useCopyToClipboard(address);
  const details = [data.category, data.address].filter(Boolean).join(" · ");

  return (
    <Row
      hover="muted"
      {...(data.mapsUrl
        ? { href: data.mapsUrl, target: "_blank", rel: "noreferrer" }
        : {})}
      icon={
        <Center className={cn(rigidClass(), "size-10")}>
          <AvatarPresentationProvider value="tile">
            <Avatar
              symbol={placeKindGlyph(data.kind)}
              fill={placeFamilyFill(data.family)}
            />
          </AvatarPresentationProvider>
        </Center>
      }
      // A failed refresh keeps the actions on screen, so Refresh — the fix —
      // is there without having to hover for it.
      actionsAlwaysVisible={refresh.error !== null}
      actions={
        <>
          <IconButton
            icon={refreshIcon}
            label="Refresh"
            tooltip={
              refresh.error === null
                ? undefined
                : `Couldn't refresh: ${refresh.error}. Try again.`
            }
            disabled={refresh.refreshing}
            onClick={refresh.refresh}
          />
          {address ? (
            <IconButton
              icon={copied ? checkIcon : copyIcon}
              label={copied ? "Copied" : "Copy address"}
              onClick={copy}
            />
          ) : null}
          <IconButton
            icon={replaceIcon}
            label="Replace place"
            onClick={onReplace}
          />
        </>
      }
    >
      <Stack gap="none">
        <Line>
          <Text variant="label">{data.name}</Text>
        </Line>
        <Line className="gap-2xs">
          {refresh.refreshing ? (
            <Spinner
              className={cn(rigidClass(), "size-3 text-muted-foreground")}
            />
          ) : null}
          {refresh.error !== null ? (
            <Text variant="caption" tone="destructive" className={rigidClass()}>
              Couldn't refresh ·&nbsp;
            </Text>
          ) : null}
          <Text variant="caption" tone="muted">
            {details}
          </Text>
        </Line>
      </Stack>
    </Row>
  );
}
