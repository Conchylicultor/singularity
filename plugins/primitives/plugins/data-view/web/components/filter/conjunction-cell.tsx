import type { ReactNode } from "react";
import { MdExpandMore } from "react-icons/md";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Frame } from "@plugins/primitives/plugins/css/plugins/frame/web";
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
    // eslint-disable-next-line spacing/no-adhoc-spacing, layout/no-adhoc-layout -- w-16 fixed alignment rail (a layout dimension the spacing ramp can't express); shrink-0 keeps the rail rigid in the flex row
    <div className="w-16 shrink-0">
      {props.index === 0 ? (
        <Center axis="vertical" className="control-sm px-2xs">
          <Text as="div" variant="body" tone="muted">
            Where
          </Text>
        </Center>
      ) : props.index === 1 ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="outline"
                aria-label="Conjunction"
                className="w-full"
              />
            }
          >
            <Frame
              className="w-full"
              content={LABEL[props.conjunction]}
              trailing={<MdExpandMore />}
            />
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
        <Center axis="vertical" className="control-sm px-2xs">
          <Text as="div" variant="body" tone="muted">
            {LABEL[props.conjunction]}
          </Text>
        </Center>
      )}
    </div>
  );
}
