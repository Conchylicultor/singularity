import {
  Collapsible,
  CollapsibleChevron,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@plugins/primitives/plugins/collapsible/web";

/**
 * Collapsible sub-section heading used within a plugin detail Section:
 * a muted label + `(count)` trigger over left-bordered content. Shared
 * across per-facet render-detail sections (slots, routes, resources, …).
 */
export function SubHeading({
  label,
  count,
  children,
}: {
  label: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <Collapsible defaultOpen>
      <CollapsibleTrigger className="gap-xs py-2xs text-caption">
        <CollapsibleChevron className="size-3.5 text-muted-foreground" />
        <span className="font-medium text-muted-foreground">{label}</span>
        <span className="text-muted-foreground/50">({count})</span>
      </CollapsibleTrigger>
      {/* eslint-disable-next-line spacing/no-adhoc-spacing -- ml-1 indents the collapsed content under its sub-heading trigger; one-off left offset paired with the left border, not sibling rhythm */}
      <CollapsibleContent className="ml-1 border-l border-border/50 pl-md pt-2xs">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}
