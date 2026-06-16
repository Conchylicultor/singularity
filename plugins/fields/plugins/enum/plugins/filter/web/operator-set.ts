import type { FilterOperatorSet } from "@plugins/primitives/plugins/data-view/web";
import { EnumSingleInput, EnumMultiInput } from "./components/enum-filter";
import {
  is,
  isNot,
  isAnyOf,
  isNoneOf,
  isEmpty,
  isNotEmpty,
} from "./internal/enum-filter-logic";

export const enumOperatorSet: FilterOperatorSet = {
  match: "enum",
  defaultOperator: "is",
  operators: [
    {
      id: "is",
      label: "Is",
      hasValue: true,
      ValueInput: EnumSingleInput,
      predicate: is,
    },
    {
      id: "is-not",
      label: "Is not",
      hasValue: true,
      ValueInput: EnumSingleInput,
      predicate: isNot,
    },
    {
      id: "is-any-of",
      label: "Is any of",
      hasValue: true,
      ValueInput: EnumMultiInput,
      predicate: isAnyOf,
    },
    {
      id: "is-none-of",
      label: "Is none of",
      hasValue: true,
      ValueInput: EnumMultiInput,
      predicate: isNoneOf,
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
