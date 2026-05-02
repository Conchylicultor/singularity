import { cn } from "@/lib/utils";
import { useScope } from "./use-scope";

export function ScopeToggle() {
  const { singularityOnly, toggle } = useScope();
  return (
    <button
      type="button"
      onClick={toggle}
      title={
        singularityOnly
          ? "Singularity sessions only — click to include all Claude Code sessions on this machine"
          : "Including all Claude Code sessions — click to filter to Singularity only"
      }
      className={cn(
        "rounded-full border px-3 py-1 text-xs transition-colors",
        singularityOnly
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      Singularity only
    </button>
  );
}
