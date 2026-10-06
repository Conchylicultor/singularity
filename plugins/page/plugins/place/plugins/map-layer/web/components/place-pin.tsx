import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Placed } from "@plugins/primitives/plugins/css/plugins/coords/web";
import { Layer } from "@plugins/primitives/plugins/css/plugins/layer/web";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { avatarFlatClass } from "@plugins/primitives/plugins/avatar/web";
import { MapLabel, type MapPinProps } from "@plugins/map/web";
import { placeKindColor } from "@plugins/page/plugins/place/core";
import { placeKindGlyph } from "@plugins/page/plugins/place/web";
import { Icon } from "@plugins/ui/plugins/icons/web";
import { placePinKind } from "../internal/place-layer";

/** The drop's head: a 30px disc. The tip lands 36px below its top (√2·15 + 15). */
const HEAD_PX = 30;
/** Air between the head and its label. */
const LABEL_GAP_PX = 4;

/**
 * A place on the map: a teardrop whose colour and glyph say what KIND of place
 * it is — the same family colour (`placeKindColor`), flat tile paint
 * (`avatarFlatClass`) and glyph (`placeKindGlyph`) as the /place card's circle,
 * so a place reads as the same thing on the page and on the map. The name sits
 * beside the drop's head as a `MapLabel`, whose paint follows the tiles, not the
 * app theme.
 *
 * The renderer anchors the pin at its bottom centre, which is the drop's tip;
 * the label is absolutely placed, so it never moves the anchor. Hover lifts the
 * drop and the active one grows from its tip, the label riding along so it
 * stays centred on the head.
 */
export function PlacePin({ pin, active, tiles }: MapPinProps) {
  const kind = placePinKind(pin);
  return (
    <span className="group/pin relative block h-9 w-[30px] cursor-pointer">
      <Layer
        className={cn(
          "origin-bottom transition-transform",
          active
            ? "scale-[1.18]"
            : "group-hover/pin:-translate-y-0.5 group-hover/pin:scale-105",
        )}
      >
        <Placed x={{ start: 0, size: HEAD_PX }} y={{ start: 0, size: HEAD_PX }}>
          {/* A teardrop is a circle with one square corner, turned 45° so that
              corner becomes the tip — 36px below the top, the anchor box's height. */}
          <Layer
            className={cn(
              "-rotate-45 rounded-full rounded-bl-none border-2 border-categorical-foreground shadow-md",
              avatarFlatClass({ slot: placeKindColor(kind), shade: 0 }),
            )}
          />
          <Center className="relative size-full">
            {/* 14px: the card tile's 46% glyph share of the 30px head. */}
            <Icon
              icon={placeKindGlyph(kind)}
              className="size-3.5 text-categorical-foreground"
            />
          </Center>
        </Placed>
        {pin.label ? (
          <Placed
            x={{ start: `calc(100% + ${LABEL_GAP_PX}px)` }}
            y={{ center: HEAD_PX / 2 }}
            className="max-w-48 whitespace-nowrap"
          >
            <MapLabel tiles={tiles}>{pin.label}</MapLabel>
          </Placed>
        ) : null}
      </Layer>
    </span>
  );
}
