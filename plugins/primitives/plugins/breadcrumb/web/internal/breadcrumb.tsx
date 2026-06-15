import type { ReactNode } from "react";

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
      {actions}
    </span>
  );
}
