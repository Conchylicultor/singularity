import type { ReactNode } from "react";
import { MdExpandMore } from "react-icons/md";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import type { FilterOperator } from "../../../core";

/**
 * Dropdown of the current field type's operators. Selecting an operator reports
 * the id to the host, which clears the rule value when `hasValue` toggles (esp.
 * moving to a value-less operator like "Is empty").
 */
export function OperatorPicker(props: {
  operators: FilterOperator[];
  value: string;
  onChange: (operatorId: string) => void;
}): ReactNode {
  const current = props.operators.find((o) => o.id === props.value);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="sm" aria-label="Filter operator" />
        }
      >
        <span className="truncate">{current?.label ?? "—"}</span>
        <MdExpandMore />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {props.operators.map((op) => (
          <DropdownMenuItem key={op.id} onClick={() => props.onChange(op.id)}>
            {op.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
