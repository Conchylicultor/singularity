import { Surface } from "@plugins/primitives/plugins/css/plugins/surface/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { rigidClass } from "@plugins/primitives/plugins/css/plugins/rigid/web";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import type { MapPinProps } from "@plugins/map/web";
import { symbol } from "@plugins/ui/plugins/icons/core";
import { Icon } from "@plugins/ui/plugins/icons/web";

const locationOnIcon = symbol("location-on");

/**
 * A place on the map: a floating bubble with the location icon and the place's
 * name, truncated so a long name cannot cover its neighbours. The renderer
 * anchors it at its bottom centre; the active one grows upward from there and
 * takes the primary tone, so the selected place reads at a glance.
 */
export function PlacePin({ pin, active }: MapPinProps) {
  return (
    <Surface
      level="overlay"
      className={cn(
        "max-w-48 origin-bottom cursor-pointer rounded-full px-xs py-2xs transition-transform",
        active && "scale-110 bg-primary text-primary-foreground",
      )}
    >
      <Line>
        <Icon
          icon={locationOnIcon}
          className={cn(
            rigidClass(),
            "size-4",
            active ? "text-primary-foreground" : "text-primary",
          )}
        />
        {pin.label ? (
          <Fill>
            <Text variant="label">{pin.label}</Text>
          </Fill>
        ) : null}
      </Line>
    </Surface>
  );
}
