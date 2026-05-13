import { cn } from "@/lib/utils";

export interface PlaceholderProps {
  children: React.ReactNode;
  tone?: "muted" | "error";
}

export function Placeholder({ children, tone = "muted" }: PlaceholderProps) {
  return (
    <div
      className={cn(
        "px-3 py-2 text-sm",
        tone === "error" ? "text-destructive" : "text-muted-foreground",
      )}
    >
      {children}
    </div>
  );
}
