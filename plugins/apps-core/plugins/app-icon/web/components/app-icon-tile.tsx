import {
  Avatar,
  AvatarPresentationProvider,
} from "@plugins/primitives/plugins/avatar/web";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { APP_TILE_PALETTE, type AppIcon } from "../../core";

/** The app-tile palette as the `--categorical-*` vars the avatar's flat tile
 *  fill reads, set on the tile itself — so the tile is the colour the Home
 *  gallery paints it, whatever theme scope the launcher sits in. */
const TILE_PALETTE_VARS = Object.fromEntries(
  Object.entries(APP_TILE_PALETTE).map(([k, v]) => [`--${k}`, v]),
) as React.CSSProperties;

/**
 * An app's icon as its launcher TILE: the glyph on a squircle in the app's
 * declared colour (`icon.color`), or one derived from `appId` when it declares
 * none — the same tile the Home gallery draws, so an app looks the same in
 * every launcher. `className` sizes the tile (e.g. `size-9`); the glyph is a
 * fixed share of it. It paints in `APP_TILE_PALETTE`, not the enclosing
 * theme's categorical slots.
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
        <span
          aria-hidden
          className={cn("block", className)}
          style={TILE_PALETTE_VARS}
        >
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
