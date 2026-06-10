import { useCallback, useMemo, useState } from "react";
import { ToggleChip } from "@plugins/primitives/plugins/toggle-chip/web";
import { Text } from "@plugins/primitives/plugins/text/web";

export interface FilterChipProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

export function FilterChip({ active, onClick, children }: FilterChipProps) {
  return (
    <ToggleChip variant="ghost" active={active} onClick={onClick}>
      {children}
    </ToggleChip>
  );
}

export interface FilterGroupProps {
  label: string;
  children: React.ReactNode;
}

export function FilterGroup({ label, children }: FilterGroupProps) {
  return (
    <div className="flex items-center gap-1">
      <Text variant="caption" className="text-muted-foreground">
        {label}:
      </Text>
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
