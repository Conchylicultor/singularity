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
    {
      id: "is",
      label: "Is",
      group: "Comparison",
      hasValue: true,
      ValueInput: DateValueInput,
      predicate: is,
    },
    {
      id: "is-before",
      label: "Is before",
      group: "Comparison",
      hasValue: true,
      ValueInput: DateValueInput,
      predicate: isBefore,
    },
    {
      id: "is-after",
      label: "Is after",
      group: "Comparison",
      hasValue: true,
      ValueInput: DateValueInput,
      predicate: isAfter,
    },
    // Kept for backward compatibility with already-saved filters, but hidden
    // from the picker — "Is before/after" plus "Is between" cover the same
    // intent. A saved rule still evaluates and shows its label in the trigger.
    {
      id: "is-on-or-before",
      label: "Is on or before",
      group: "Comparison",
      hidden: true,
      hasValue: true,
      ValueInput: DateValueInput,
      predicate: isOnOrBefore,
    },
    {
      id: "is-on-or-after",
      label: "Is on or after",
      group: "Comparison",
      hidden: true,
      hasValue: true,
      ValueInput: DateValueInput,
      predicate: isOnOrAfter,
    },
    {
      id: "is-between",
      label: "Is between",
      group: "Comparison",
      hasValue: true,
      ValueInput: DateRangeInput,
      predicate: isBetween,
    },
    {
      id: "is-within-past",
      label: "Is within the past",
      group: "Relative",
      hasValue: true,
      ValueInput: RelativeRangeInput,
      predicate: isWithinPast,
    },
    {
      id: "is-within-next",
      label: "Is within the next",
      group: "Relative",
      hasValue: true,
      ValueInput: RelativeRangeInput,
      predicate: isWithinNext,
    },
    {
      id: "is-empty",
      label: "Is empty",
      group: "Presence",
      hasValue: false,
      predicate: isEmpty,
    },
    {
      id: "is-not-empty",
      label: "Is not empty",
      group: "Presence",
      hasValue: false,
      predicate: isNotEmpty,
    },
  ],
};
