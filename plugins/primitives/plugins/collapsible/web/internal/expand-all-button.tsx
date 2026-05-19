import { MdUnfoldLess, MdUnfoldMore } from "react-icons/md";
import { cn } from "@/lib/utils";

export interface ExpandAllButtonProps {
  allExpanded: boolean;
  onToggle: () => void;
  disabled?: boolean;
  variant?: "compact" | "full";
}

export function ExpandAllButton({
  allExpanded,
  onToggle,
  disabled = false,
  variant = "compact",
}: ExpandAllButtonProps) {
  const label = allExpanded ? "Collapse all" : "Expand all";
  const Icon = allExpanded ? MdUnfoldLess : MdUnfoldMore;

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={cn(
        "flex shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
        variant === "compact"
          ? "size-7 hover:bg-accent"
          : "gap-1 text-xs",
      )}
    >
      <Icon className="size-4" />
      {variant === "full" && label}
    </button>
  );
}
