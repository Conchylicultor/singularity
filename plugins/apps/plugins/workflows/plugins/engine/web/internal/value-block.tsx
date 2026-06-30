import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
  CollapsibleChevron,
} from "@plugins/primitives/plugins/collapsible/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";

/**
 * Always-visible, string-aware value renderer. A plain string is rendered raw
 * (no JSON quotes/escaping); any other value is pretty-printed JSON. Returns
 * null for null/undefined.
 */
export function ValueBlock({ value }: { value: unknown }) {
  if (value == null) return null;
  if (typeof value === "string") {
    return (
      // eslint-disable-next-line layout/no-adhoc-layout -- horizontal scroll for the raw value preview; not a layout container
      <pre className="text-caption overflow-x-auto rounded-md bg-muted p-sm text-muted-foreground whitespace-pre-wrap break-words">
        {value}
      </pre>
    );
  }
  return (
    // eslint-disable-next-line layout/no-adhoc-layout -- horizontal scroll for the raw JSON code preview; not a layout container
    <pre className="text-caption overflow-x-auto rounded-md bg-muted p-sm text-muted-foreground">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

/**
 * Collapsible labeled value wrapper. The content renders through ValueBlock, so
 * strings appear raw and objects as JSON. Returns null for null/undefined.
 */
export function CollapsibleValue({
  label,
  value,
  defaultOpen,
}: {
  label: string;
  value: unknown;
  defaultOpen?: boolean;
}) {
  if (value == null) return null;
  return (
    <Collapsible className="py-2xs" defaultOpen={defaultOpen}>
      <CollapsibleTrigger className="gap-xs">
        <CollapsibleChevron className="size-4 text-muted-foreground" />
        <Text as="span" variant="caption" className="text-muted-foreground">{label}</Text>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ValueBlock value={value} />
      </CollapsibleContent>
    </Collapsible>
  );
}
