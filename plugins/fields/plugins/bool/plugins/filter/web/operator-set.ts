import type { FilterOperatorSet } from "@plugins/primitives/plugins/data-view/web";
import { BoolValueInput } from "./components/bool-filter";
import { is, isNot } from "./internal/bool-filter-logic";

// A bool rule constrains rows even with no stored operand: an absent value reads
// as "Unchecked" (`asBool(undefined) === false`), a real constraint. So these
// operators are always complete — which keeps the chip's rule count in step with
// what actually filters (an absent value would otherwise count as 0 yet filter).
const alwaysComplete = () => true;

export const boolOperatorSet: FilterOperatorSet = {
  match: "bool",
  defaultOperator: "is",
  operators: [
    {
      id: "is",
      label: "Is",
      hasValue: true,
      ValueInput: BoolValueInput,
      predicate: is,
      isComplete: alwaysComplete,
    },
    {
      id: "is-not",
      label: "Is not",
      hasValue: true,
      ValueInput: BoolValueInput,
      predicate: isNot,
      isComplete: alwaysComplete,
    },
  ],
};
