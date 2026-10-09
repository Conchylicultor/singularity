import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";

export interface PlaceholderProps {
  children: React.ReactNode;
  tone?: "muted" | "error";
}

export function Placeholder({ children, tone = "muted" }: PlaceholderProps) {
  return (
    <div
      className={cn(
        "px-md py-sm text-body",
        tone === "error" ? "text-destructive" : "text-muted-foreground",
      )}
    >
      {children}
    </div>
  );
}
