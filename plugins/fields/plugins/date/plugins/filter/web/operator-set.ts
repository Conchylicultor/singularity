import type { FilterOperatorSet } from "@plugins/primitives/plugins/data-view/web";
import {
  DateValueInput,
  DateRangeInput,
  RelativeRangeInput,
} from "./components/date-filter";
import {
  is,
  isBefore,
  isAfter,
  isOnOrBefore,
  isOnOrAfter,
  isBetween,
  isWithinPast,
  isWithinNext,
  isEmpty,
  isNotEmpty,
} from "./internal/date-filter-logic";

export const dateOperatorSet: FilterOperatorSet = {
  match: "date",
  defaultOperator: "is",
  operators: [
    { id: "is", label: "Is", hasValue: true, ValueInput: DateValueInput, predicate: is },
    {
      id: "is-before",
      label: "Is before",
      hasValue: true,
      ValueInput: DateValueInput,
      predicate: isBefore,
    },
    {
      id: "is-after",
      label: "Is after",
      hasValue: true,
      ValueInput: DateValueInput,
      predicate: isAfter,
    },
    {
      id: "is-on-or-before",
      label: "Is on or before",
      hasValue: true,
      ValueInput: DateValueInput,
      predicate: isOnOrBefore,
    },
    {
      id: "is-on-or-after",
      label: "Is on or after",
      hasValue: true,
      ValueInput: DateValueInput,
      predicate: isOnOrAfter,
    },
    {
      id: "is-between",
      label: "Is between",
      hasValue: true,
      ValueInput: DateRangeInput,
      predicate: isBetween,
    },
    {
      id: "is-within-past",
      label: "Is within the past",
      hasValue: true,
      ValueInput: RelativeRangeInput,
      predicate: isWithinPast,
    },
    {
      id: "is-within-next",
      label: "Is within the next",
      hasValue: true,
      ValueInput: RelativeRangeInput,
      predicate: isWithinNext,
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
