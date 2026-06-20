import { Text } from "./text";

export interface SectionLabelProps extends React.HTMLAttributes<HTMLElement> {
  as?: React.ElementType;
}

/**
 * Eyebrow / form-section / content-header label — the small-caps muted label.
 * A thin composition over `<Text variant="eyebrow">`: the eyebrow geometry lives
 * in the typography primitive (one definition), this helper just adds the muted
 * tone and the block (`div`) host that section labels conventionally use.
 */
export function SectionLabel({
  as = "div",
  className,
  children,
  ...rest
}: SectionLabelProps) {
  return (
    <Text variant="eyebrow" tone="muted" as={as} className={className} {...rest}>
      {children}
    </Text>
  );
}
