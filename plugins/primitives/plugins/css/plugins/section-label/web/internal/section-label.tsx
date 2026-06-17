import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";

export interface SectionLabelProps {
  as?: React.ElementType;
  className?: string;
  children: React.ReactNode;
}

export function SectionLabel({
  as: As = "div",
  className,
  children,
}: SectionLabelProps) {
  return (
    <As
      className={cn(
        "whitespace-nowrap text-caption uppercase tracking-wide text-muted-foreground",
        className,
      )}
    >
      {children}
    </As>
  );
}
