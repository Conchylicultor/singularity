import type { ReactNode } from "react";
import { MdExpandMore } from "react-icons/md";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@plugins/primitives/plugins/ui-kit/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import type { FilterConjunction } from "../../../core";

const LABEL: Record<FilterConjunction, string> = { and: "And", or: "Or" };

/**
 * The left "conjunction" column shared by rule rows and nested group rows,
 * following Notion exactly:
 *   - index 0  → static "Where"
 *   - index 1  → editable And/Or dropdown (sets the WHOLE group's conjunction)
 *   - index 2+ → the group's conjunction as static text (matches index 1)
 *
 * Fixed width so every row's field/operator columns align into a tidy rail.
 */
export function ConjunctionCell(props: {
  index: number;
  conjunction: FilterConjunction;
  onChange: (conjunction: FilterConjunction) => void;
}): ReactNode {
  return (
    // eslint-disable-next-line spacing/no-adhoc-spacing -- w-16 is a fixed alignment rail for the conjunction column, a layout dimension the spacing ramp can't express
    <div className="w-16 shrink-0">
      {props.index === 0 ? (
        <Text
          as="div"
          variant="body"
          tone="muted"
          className="flex control-sm items-center px-2xs"
        >
          Where
        </Text>
      ) : props.index === 1 ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="outline"
                size="sm"
                aria-label="Conjunction"
                className="w-full justify-between"
              />
            }
          >
            <span>{LABEL[props.conjunction]}</span>
            <MdExpandMore />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => props.onChange("and")}>
              And
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => props.onChange("or")}>
              Or
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <Text
          as="div"
          variant="body"
          tone="muted"
          className="flex control-sm items-center px-2xs"
        >
          {LABEL[props.conjunction]}
        </Text>
      )}
    </div>
  );
}
