import type { ReactElement } from "react";
import { cn } from "@/lib/utils";
import { useMultiSelectItem } from "./use-multi-select-item";

export type SelectionCheckboxProps = {
  id: string;
  className?: string;
};

export function SelectionCheckbox({
  id,
  className,
}: SelectionCheckboxProps): ReactElement {
  const { isSelected, isActive, toggle } = useMultiSelectItem(id);

  return (
    <input
      type="checkbox"
      checked={isSelected}
      onChange={() => {}}
      onClick={toggle}
      aria-label="Select item"
      className={cn(
        "size-3.5 shrink-0 cursor-pointer accent-primary",
        !isActive && "opacity-0 group-hover:opacity-100",
        className,
      )}
    />
  );
}
