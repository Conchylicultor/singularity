import { useCallback, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

export interface FilterChipProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

export function FilterChip({ active, onClick, children }: FilterChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors",
        active
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

export interface FilterGroupProps {
  label: string;
  children: React.ReactNode;
}

export function FilterGroup({ label, children }: FilterGroupProps) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-muted-foreground">{label}:</span>
      {children}
    </div>
  );
}

export interface ChipFilterHandle<T extends string> {
  value: T;
  setValue: (v: T) => void;
  matches: (itemValue: T) => boolean;
}

export function useChipFilter<T extends string>(
  allValue: T,
): ChipFilterHandle<T> {
  const [value, setValue] = useState<T>(allValue);
  const matches = useCallback(
    (itemValue: T) => value === allValue || value === itemValue,
    [value, allValue],
  );
  return useMemo(
    () => ({ value, setValue, matches }),
    [value, setValue, matches],
  );
}
