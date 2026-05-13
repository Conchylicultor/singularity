import { cn } from "@/lib/utils";

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
        "text-xs uppercase tracking-wide text-muted-foreground",
        className,
      )}
    >
      {children}
    </As>
  );
}
