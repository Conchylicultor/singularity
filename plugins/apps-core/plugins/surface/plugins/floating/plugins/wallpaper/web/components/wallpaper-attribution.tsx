import { Pin } from "@plugins/primitives/plugins/css/plugins/pin/web";
import { Surface } from "@plugins/primitives/plugins/css/plugins/surface/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { useConfig } from "@plugins/config_v2/web";
import { wallpaperConfig } from "../../core";

/**
 * Small, unobtrusive corner credit for the current wallpaper (CC-BY compliance).
 * Renders nothing for the default gradient backdrop or an image with no
 * attribution. When a creator/license is present, shows "Photo by {creator} ·
 * {license}", linking the whole chip to `sourceUrl` when available.
 */
export function WallpaperAttribution() {
  const { state } = useConfig(wallpaperConfig);

  if (state.kind !== "image") return null;
  const attr = state.attribution;
  const creator = attr?.creator?.trim();
  const license = attr?.license?.trim();
  if (!creator && !license) return null;

  const label = [
    creator ? `Photo by ${creator}` : "Photo",
    license,
  ]
    .filter(Boolean)
    .join(" · ");

  const sourceUrl = attr?.sourceUrl?.trim();

  const content = (
    <Surface level="overlay" className="px-xs py-2xs opacity-70 hover:opacity-100">
      <Text variant="caption" tone="muted" as="span">
        {label}
      </Text>
    </Surface>
  );

  return (
    <Pin to="bottom-right" offset="sm" layer="raised">
      {sourceUrl ? (
        <a href={sourceUrl} target="_blank" rel="noreferrer noopener">
          {content}
        </a>
      ) : (
        content
      )}
    </Pin>
  );
}
