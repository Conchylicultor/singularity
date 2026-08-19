import type { ReactNode } from "react";
import { RowActions } from "@plugins/primitives/plugins/row-actions/web";
import { rigidClass } from "@plugins/primitives/plugins/css/plugins/rigid/web";
import { yieldClass } from "@plugins/primitives/plugins/css/plugins/yield/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";

export interface BreadcrumbSegment {
  key: string;
  label: ReactNode;
}

export interface BreadcrumbProps {
  segments: BreadcrumbSegment[];
  onNavigate?: (index: number, segment: BreadcrumbSegment) => void;
  separator?: ReactNode;
  actions?: ReactNode;
}

export function Breadcrumb({
  segments,
  onNavigate,
  separator = "/",
  actions,
}: BreadcrumbProps) {
  if (segments.length === 0) return null;

  const lastIndex = segments.length - 1;
  const prefix = segments.slice(0, lastIndex);
  const active = segments[lastIndex]!;

  return (
    <Stack
      as="span"
      direction="row"
      gap="2xs"
      align="baseline"
      // Yields, never grows: the whole trail must fall below its content width so
      // the prefix can truncate, but it must NOT grow into its parent's slack — a
      // breadcrumb is left-packed chrome, and consumers place it beside other
      // strip content that would be pushed.
      className={cn(
        yieldClass("x"),
        "whitespace-nowrap [&_svg:not([class*='size-'])]:icon-auto",
      )}
    >
      {prefix.length > 0 && (
        // `truncate`'s overflow-hidden already floors this flex item's automatic
        // minimum size at 0, so it needs no min-w-0 of its own.
        <Stack
          as="span"
          direction="row"
          gap="none"
          align="baseline"
          className="truncate"
        >
          {prefix.map((seg, i) => (
            <Stack
              as="span"
              key={seg.key}
              direction="row"
              gap="none"
              align="baseline"
              className="whitespace-nowrap"
            >
              {onNavigate ? (
                <button
                  type="button"
                  className="font-normal text-muted-foreground hover:text-foreground hover:underline"
                  onClick={() => onNavigate(i, seg)}
                >
                  {seg.label}
                </button>
              ) : (
                <span className="font-normal text-muted-foreground">
                  {seg.label}
                </span>
              )}
              <span className="font-normal text-muted-foreground/50">
                {separator}
              </span>
            </Stack>
          ))}
        </Stack>
      )}
      <span className={cn(rigidClass(), "truncate font-medium")}>
        {active.label}
      </span>
      {actions && (
        // A trailing action cluster on a row-shaped strip is the `row-actions`
        // primitive, never raw JSX — one implementation owns the sizing, the
        // click/pointerdown guards and the popup-hold. `pin={null}` + always
        // visible is what a breadcrumb's trailing slot is: it sits in flow right
        // after the active segment (there is no `ml-auto` here — the trail is
        // left-packed and the actions belong to its leaf, not to the far edge),
        // and it is never hover-revealed because the trail is chrome, not a row
        // in a list. `shrink-0` keeps it out of the truncation the prefix and
        // the active label absorb.
        <RowActions pin={null} alwaysVisible className={rigidClass()}>
          {actions}
        </RowActions>
      )}
    </Stack>
  );
}
