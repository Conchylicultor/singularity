import type { FilterOperatorSet } from "@plugins/primitives/plugins/data-view/web";
import { BoolValueInput } from "./components/bool-filter";
import { is, isNot } from "./internal/bool-filter-logic";

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
    },
    {
      id: "is-not",
      label: "Is not",
      hasValue: true,
      ValueInput: BoolValueInput,
      predicate: isNot,
    },
  ],
};
