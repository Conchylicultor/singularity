import type { FilterOperatorSet } from "@plugins/primitives/plugins/data-view/web";
import { NumberValueInput, NumberRangeInput } from "./components/number-filter";
import {
  eq,
  neq,
  gt,
  lt,
  gte,
  lte,
  between,
  isEmpty,
  isNotEmpty,
} from "./internal/number-filter-logic";

export const numberOperatorSet: FilterOperatorSet = {
  match: "number",
  defaultOperator: "=",
  operators: [
    { id: "=", label: "=", hasValue: true, ValueInput: NumberValueInput, predicate: eq },
    { id: "≠", label: "≠", hasValue: true, ValueInput: NumberValueInput, predicate: neq },
    { id: ">", label: ">", hasValue: true, ValueInput: NumberValueInput, predicate: gt },
    { id: "<", label: "<", hasValue: true, ValueInput: NumberValueInput, predicate: lt },
    { id: "≥", label: "≥", hasValue: true, ValueInput: NumberValueInput, predicate: gte },
    { id: "≤", label: "≤", hasValue: true, ValueInput: NumberValueInput, predicate: lte },
    {
      id: "between",
      label: "Between",
      hasValue: true,
      ValueInput: NumberRangeInput,
      predicate: between,
    },
    { id: "is-empty", label: "Is empty", hasValue: false, predicate: isEmpty },
    {
      id: "is-not-empty",
      label: "Is not empty",
      hasValue: false,
      predicate: isNotEmpty,
    },
  ],
};
