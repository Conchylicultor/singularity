import {
  cn,
  useControlSize,
  type ControlSize,
  type DensityControlled,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { forwardRef } from "react";
import { SvgIcon } from "@plugins/primitives/plugins/icon-picker/web";
import type { SvgNode } from "@plugins/primitives/plugins/icon-picker/core";
import type { AvatarShape } from "../../core";
import {
  avatarColorPick,
  avatarFlatClass,
  avatarSoftClass,
} from "../internal/colors";
import {
  useAvatarPresentation,
  type AvatarPresentation,
} from "../internal/presentation";

export interface AvatarProps extends DensityControlled {
  icon?: string | null;
  color?: string | null;
  svgNodes?: SvgNode[] | null;
  /** Box outline. Defaults to `circle`. */
  shape?: AvatarShape;
  /** Tailwind bg class for an overlaid status dot (Slack-style presence). */
  statusDot?: string | null;
  /** Used as a stable key for the deterministic color fallback when `color` is null. */
  fallbackKey?: string;
  /**
   * Single character rendered centered when there is no icon/svg, so the disc is
   * never blank. Only the first char is used, uppercased. Providing this also
   * tints the disc via the deterministic auto-color (from `fallbackKey`) unless
   * an explicit `color` is set or `colorless` is true.
   */
  fallbackGlyph?: string;
  /** Force a neutral (muted) disc, ignoring `color` and the auto-color fallback. */
  colorless?: boolean;
  className?: string;
  title?: string;
}

interface Geometry {
  box: string;
  icon: string;
  /** Font size of the fallback letter; empty when the box's own `text-*` sizes it. */
  glyph: string;
  dot: string;
  ring: string;
}

const SIZE_MAP: Record<ControlSize, Geometry> = {
  xs: {
    box: "size-4 text-[10px]",
    icon: "size-2.5",
    glyph: "",
    dot: "size-1.5 -right-px -bottom-px",
    ring: "ring-1",
  },
  sm: {
    box: "size-6 text-xs",
    icon: "size-3.5",
    glyph: "",
    dot: "size-2 -right-px -bottom-px",
    ring: "ring-2",
  },
  md: {
    box: "size-8 text-sm",
    icon: "size-4",
    glyph: "",
    dot: "size-2.5 -right-0.5 -bottom-0.5",
    ring: "ring-2",
  },
  lg: {
    box: "size-12 text-base",
    icon: "size-6",
    glyph: "",
    dot: "size-3 -right-0.5 -bottom-0.5",
    ring: "ring-2",
  },
};

/** Tile geometry: the box fills the host-sized parent and is a size container,
 *  so the glyph (svg, or the letter's font size) is 46% of it; the dot carries no ring. */
const TILE_GEOMETRY: Geometry = {
  box: "size-full @container-[size]",
  icon: "size-[46%]",
  glyph: "text-[length:46cqh]",
  dot: "size-[18%] right-[4%] bottom-[4%]",
  ring: "",
};

const SHAPE_CLASS: Record<AvatarShape, string> = {
  circle: "rounded-full",
  squircle: "rounded-squircle",
};

function geometryFor(
  presentation: AvatarPresentation,
  size: ControlSize,
): Geometry {
  return presentation === "tile" ? TILE_GEOMETRY : SIZE_MAP[size];
}

export const Avatar = forwardRef<HTMLSpanElement, AvatarProps>(function Avatar(
  {
    icon,
    color,
    svgNodes,
    shape = "circle",
    statusDot,
    fallbackKey,
    fallbackGlyph,
    colorless,
    className,
    title,
  },
  ref,
) {
  const size = useControlSize();
  const presentation = useAvatarPresentation();
  const sz = geometryFor(presentation, size);
  const hasSvg = svgNodes != null && svgNodes.length > 0;
  const glyph = fallbackGlyph ? fallbackGlyph.charAt(0).toUpperCase() : null;
  const filled = !colorless && (hasSvg || color != null || glyph != null);
  const pick = filled
    ? avatarColorPick(color, fallbackKey ?? icon ?? undefined)
    : null;
  const paint =
    presentation === "tile" ? avatarFlatClass(pick) : avatarSoftClass(pick);
  // leading-none keeps the fallback glyph optically centered; its font size comes
  // from the box's density variant (badge) or the tile's glyph size, not text hierarchy.
  // eslint-disable-next-line text/no-adhoc-typography -- see above
  const glyphClass = cn("font-medium leading-none", sz.glyph);
  return (
    <span
      ref={ref}
      title={title}
      // eslint-disable-next-line layout/no-adhoc-layout -- rigid inline-level avatar disc: inline-flex center on a shrink-0 leaf that sits inline in flex rows; Center is block-level grid and would break inline placement
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center",
        SHAPE_CLASS[shape],
        sz.box,
        paint,
        className,
      )}
    >
      {hasSvg ? (
        <SvgIcon nodes={svgNodes!} className={sz.icon} />
      ) : glyph ? (
        <span className={glyphClass}>{glyph}</span>
      ) : null}
      {statusDot ? (
        <span
          // eslint-disable-next-line layout/no-adhoc-layout -- status dot pinned bottom-right with per-size sub-pixel overhang offsets (-right-px/-0.5) baked into SIZE_MAP; not on the spacing ramp Pin/outset expresses
          className={cn(
            "absolute rounded-full ring-background",
            sz.dot,
            sz.ring,
            statusDot,
          )}
          aria-hidden
        />
      ) : null}
    </span>
  );
});
