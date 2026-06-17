import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { forwardRef } from "react";
import { SvgIcon } from "@plugins/primitives/plugins/icon-picker/web";
import type { SvgNode } from "@plugins/primitives/plugins/icon-picker/core";
import { avatarColorClass } from "../internal/colors";

export type AvatarSize = "xs" | "sm" | "md" | "lg";

export interface AvatarProps {
  icon?: string | null;
  color?: string | null;
  svgNodes?: SvgNode[] | null;
  size?: AvatarSize;
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

const SIZE_MAP: Record<AvatarSize, { box: string; icon: string; dot: string; ring: string }> = {
  xs: { box: "size-4 text-[10px]", icon: "size-2.5", dot: "size-1.5 -right-px -bottom-px", ring: "ring-1" },
  sm: { box: "size-6 text-xs", icon: "size-3.5", dot: "size-2 -right-px -bottom-px", ring: "ring-2" },
  md: { box: "size-8 text-sm", icon: "size-4", dot: "size-2.5 -right-0.5 -bottom-0.5", ring: "ring-2" },
  lg: { box: "size-12 text-base", icon: "size-6", dot: "size-3 -right-0.5 -bottom-0.5", ring: "ring-2" },
};

export const Avatar = forwardRef<HTMLSpanElement, AvatarProps>(function Avatar(
  { icon, color, svgNodes, size = "sm", statusDot, fallbackKey, fallbackGlyph, colorless, className, title },
  ref,
) {
  const sz = SIZE_MAP[size];
  const hasSvg = svgNodes != null && svgNodes.length > 0;
  const glyph = fallbackGlyph ? fallbackGlyph.charAt(0).toUpperCase() : null;
  const filled = !colorless && (hasSvg || color != null || glyph != null);
  const bg = filled ? avatarColorClass(color, fallbackKey ?? icon ?? undefined) : "bg-muted";
  return (
    <span
      ref={ref}
      title={title}
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center rounded-full",
        sz.box,
        bg,
        className,
      )}
    >
      {hasSvg ? (
        <SvgIcon nodes={svgNodes!} className={sz.icon} />
      ) : glyph ? (
        // eslint-disable-next-line text/no-adhoc-typography -- leading-none keeps the fallback glyph optically centered; font size comes from the box's size variant, not text hierarchy
        <span className="font-medium leading-none">{glyph}</span>
      ) : null}
      {statusDot ? (
        <span
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
