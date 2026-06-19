import type { ReactNode } from "react";
import { Frame } from "@plugins/primitives/plugins/css/plugins/frame/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Clip } from "@plugins/primitives/plugins/css/plugins/clip/web";

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

  // The clipped prefix is the flexible region (truncates/clips first); the active
  // segment + actions are the rigid trailing cluster.
  const prefixNode =
    prefix.length > 0 ? (
      <Clip className="font-normal text-muted-foreground">
        <Stack as="span" direction="row" align="baseline" gap="none">
          {prefix.map((seg, i) => (
            <Stack
              as="span"
              direction="row"
              align="baseline"
              gap="none"
              key={seg.key}
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
      </Clip>
    ) : undefined;

  return (
    <Frame
      align="baseline"
      gap="2xs"
      className="whitespace-nowrap [&_svg:not([class*='size-'])]:icon-auto"
      content={prefixNode}
      trailing={
        <>
          <span className="font-medium">{active.label}</span>
          {actions}
        </>
      }
    />
  );
}
