import { useCallback, useMemo, useState } from "react";
import { ToggleChip } from "@plugins/primitives/plugins/css/plugins/toggle-chip/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import type { DensityControlled } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";

export interface FilterChipProps extends DensityControlled {
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
    <Stack direction="row" align="center" gap="xs">
      <Text variant="caption" className="text-muted-foreground">
        {label}:
      </Text>
      {children}
    </Stack>
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
