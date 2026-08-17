import type { ReactNode } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { ControlPanel } from "@plugins/primitives/plugins/css/plugins/control-panel/web";
import type { FilterConjunction } from "../../../core";

const LABEL: Record<FilterConjunction, string> = { and: "And", or: "Or" };

/**
 * The leading word of a rule's sentence, following Notion exactly:
 *   - index 0  → static "Where"
 *   - index 1  → editable And/Or picker (sets the WHOLE group's conjunction)
 *   - index 2+ → the group's conjunction as static text (matches index 1)
 *
 * It draws no box of its own. It used to be a `w-16` rail with its own `Center`
 * + `control-sm` chrome — a hand-made column that had to be kept in step with
 * every other builder's leading column by eye. It now fills the rule row's
 * `prefix` TRACK, which is what puts the filter and sort builders on one rail.
 */
export function ConjunctionCell(props: {
  index: number;
  conjunction: FilterConjunction;
  onChange: (conjunction: FilterConjunction) => void;
}): ReactNode {
  if (props.index === 0) return "Where";
  if (props.index > 1) return LABEL[props.conjunction];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <ControlPanel.Field
            aria-label="Conjunction"
            label={LABEL[props.conjunction]}
          />
        }
      />
      <DropdownMenuContent align="start">
        <DropdownMenuItem onClick={() => props.onChange("and")}>
          And
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => props.onChange("or")}>
          Or
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
