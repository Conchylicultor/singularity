import type { FilterOperatorSet } from "@plugins/primitives/plugins/data-view/web";
import { TextValueInput } from "./components/text-filter";
import {
  contains,
  doesNotContain,
  is,
  isNot,
  isEmpty,
  isNotEmpty,
} from "./internal/text-filter-logic";

export const textOperatorSet: FilterOperatorSet = {
  match: "text",
  defaultOperator: "contains",
  operators: [
    {
      id: "contains",
      label: "Contains",
      hasValue: true,
      ValueInput: TextValueInput,
      predicate: contains,
    },
    {
      id: "does-not-contain",
      label: "Does not contain",
      hasValue: true,
      ValueInput: TextValueInput,
      predicate: doesNotContain,
    },
    {
      id: "is",
      label: "Is",
      hasValue: true,
      ValueInput: TextValueInput,
      predicate: is,
    },
    {
      id: "is-not",
      label: "Is not",
      hasValue: true,
      ValueInput: TextValueInput,
      predicate: isNot,
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
