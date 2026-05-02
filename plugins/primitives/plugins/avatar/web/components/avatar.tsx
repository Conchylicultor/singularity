import { forwardRef } from "react";
import { cn } from "@/lib/utils";
import { avatarColorClass } from "../internal/colors";
import { resolveAvatarIcon } from "../internal/icons";

export type AvatarSize = "xs" | "sm" | "md" | "lg";

export interface AvatarProps {
  icon?: string | null;
  color?: string | null;
  size?: AvatarSize;
  /** Tailwind bg class for an overlaid status dot (Slack-style presence). */
  statusDot?: string | null;
  /** Used as a stable key for the deterministic color fallback when `color` is null. */
  fallbackKey?: string;
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
  { icon, color, size = "sm", statusDot, fallbackKey, className, title },
  ref,
) {
  const Icon = resolveAvatarIcon(icon);
  const sz = SIZE_MAP[size];
  const filled = Icon != null || color != null;
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
      {Icon ? <Icon className={sz.icon} aria-hidden /> : null}
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
