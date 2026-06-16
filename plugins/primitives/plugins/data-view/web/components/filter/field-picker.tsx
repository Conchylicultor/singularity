import type { ReactNode } from "react";
import { MdExpandMore } from "react-icons/md";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@plugins/primitives/plugins/ui-kit/web";
import type { FieldDef } from "../../../core";
import { useResolveFieldIcon } from "../../internal/use-field-icon";

/**
 * Dropdown of the schema's filterable fields, each with its field-type identity
 * icon + label. Selecting a field reports it to the host, which resets the
 * rule's operator to the new type's default and clears the value.
 */
export function FieldPicker<TRow>(props: {
  fields: FieldDef<TRow>[];
  value: string;
  onChange: (fieldId: string) => void;
}): ReactNode {
  const resolveIcon = useResolveFieldIcon();
  const current = props.fields.find((f) => f.id === props.value);
  const CurrentIcon = current ? resolveIcon(current.type ?? "text") : undefined;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="sm" aria-label="Filter field" />
        }
      >
        {CurrentIcon ? <CurrentIcon /> : null}
        <span className="truncate">{current?.label ?? "Select field"}</span>
        <MdExpandMore />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {props.fields.map((field) => {
          const Icon = resolveIcon(field.type ?? "text");
          return (
            <DropdownMenuItem
              key={field.id}
              onClick={() => props.onChange(field.id)}
            >
              {Icon ? <Icon /> : null}
              <span className="truncate">{field.label}</span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
