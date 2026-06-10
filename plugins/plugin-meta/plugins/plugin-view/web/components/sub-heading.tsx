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
      <CollapsibleTrigger className="gap-1 py-0.5 text-caption">
        <CollapsibleChevron className="size-3.5 text-muted-foreground" />
        <span className="font-medium text-muted-foreground">{label}</span>
        <span className="text-muted-foreground/50">({count})</span>
      </CollapsibleTrigger>
      <CollapsibleContent className="ml-1 border-l border-border/50 pl-3 pt-0.5">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}
