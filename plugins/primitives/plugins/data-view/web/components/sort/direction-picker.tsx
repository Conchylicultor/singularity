import type { ReactNode } from "react";
import {
  MdArrowDownward,
  MdArrowUpward,
  MdExpandMore,
} from "react-icons/md";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";

/**
 * Dropdown of the two sort directions. The trigger shows the current direction's
 * arrow + label ("Ascending" / "Descending"); selecting one reports it to the
 * host, which rewrites the rule's direction in place (keeping its field & priority).
 */
export function DirectionPicker(props: {
  value: "asc" | "desc";
  onChange: (direction: "asc" | "desc") => void;
}): ReactNode {
  const asc = props.value === "asc";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="sm" aria-label="Sort direction" />
        }
      >
        {asc ? <MdArrowUpward /> : <MdArrowDownward />}
        <span className="truncate">{asc ? "Ascending" : "Descending"}</span>
        <MdExpandMore />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onClick={() => props.onChange("asc")}>
          <MdArrowUpward />
          Ascending
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => props.onChange("desc")}>
          <MdArrowDownward />
          Descending
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
