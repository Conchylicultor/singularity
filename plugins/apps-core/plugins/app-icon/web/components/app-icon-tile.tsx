import {
  Avatar,
  AvatarPresentationProvider,
} from "@plugins/primitives/plugins/avatar/web";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import type { AppIcon } from "../../core";

/**
 * An app's icon as its launcher TILE: the glyph on a squircle in the app's
 * declared colour (`icon.color`), or one derived from `appId` when it declares
 * none — the same tile the Home gallery draws, so an app looks the same in
 * every launcher. `className` sizes the tile (e.g. `size-9`); the glyph is a
 * fixed share of it.
 */
export function AppIconTile({
  icon,
  appId,
  className,
}: {
  icon: AppIcon;
  /** Seeds the derived colour when the icon declares none. */
  appId: string;
  className?: string;
}) {
  switch (icon.kind) {
    case "symbol":
      return (
        <span aria-hidden className={cn("block", className)}>
          <AvatarPresentationProvider value="tile">
            <Avatar
              symbol={icon.symbol}
              color={icon.color ?? null}
              shape="squircle"
              fallbackKey={appId}
            />
          </AvatarPresentationProvider>
        </span>
      );
  }
}
