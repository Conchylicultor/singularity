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
 * arrow + a **type-aware** label ("A → Z" / "Newest first" / "1 → 9"…), resolved
 * by the host from the field's identity (`labels`, falling back to the generic
 * "Ascending" / "Descending"). Selecting one reports it to the host, which
 * rewrites the rule's direction in place (keeping its field & priority).
 */
export function DirectionPicker(props: {
  value: "asc" | "desc";
  labels: { asc: string; desc: string };
  onChange: (direction: "asc" | "desc") => void;
}): ReactNode {
  const asc = props.value === "asc";
  const { labels } = props;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" aria-label="Sort direction" />
        }
      >
        {asc ? <MdArrowUpward /> : <MdArrowDownward />}
        <span className="truncate">{asc ? labels.asc : labels.desc}</span>
        <MdExpandMore />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onClick={() => props.onChange("asc")}>
          <MdArrowUpward />
          {labels.asc}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => props.onChange("desc")}>
          <MdArrowDownward />
          {labels.desc}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
