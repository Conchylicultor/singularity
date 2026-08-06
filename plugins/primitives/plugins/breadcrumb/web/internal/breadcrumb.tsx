import type { ReactNode } from "react";
import { RowActions } from "@plugins/primitives/plugins/row-actions/web";

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
    <span className="flex min-w-0 items-baseline gap-2xs whitespace-nowrap [&_svg:not([class*='size-'])]:icon-auto">
      {prefix.length > 0 && (
        <span className="flex min-w-0 shrink items-baseline truncate">
          {prefix.map((seg, i) => (
            <span
              key={seg.key}
              className="flex items-baseline whitespace-nowrap"
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
            </span>
          ))}
        </span>
      )}
      <span className="shrink-0 truncate font-medium">{active.label}</span>
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
        <RowActions pin={null} alwaysVisible className="shrink-0">
          {actions}
        </RowActions>
      )}
    </span>
  );
}
