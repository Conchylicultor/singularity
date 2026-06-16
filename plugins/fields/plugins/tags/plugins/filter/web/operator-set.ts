import type { FilterOperatorSet } from "@plugins/primitives/plugins/data-view/web";
import { TagSingleInput, TagMultiInput } from "./components/tags-filter";
import {
  contains,
  doesNotContain,
  containsAnyOf,
  containsAllOf,
  isEmpty,
  isNotEmpty,
} from "./internal/tags-filter-logic";

export const tagsOperatorSet: FilterOperatorSet = {
  match: "tags",
  defaultOperator: "contains",
  operators: [
    {
      id: "contains",
      label: "Contains",
      hasValue: true,
      ValueInput: TagSingleInput,
      predicate: contains,
    },
    {
      id: "does-not-contain",
      label: "Does not contain",
      hasValue: true,
      ValueInput: TagSingleInput,
      predicate: doesNotContain,
    },
    {
      id: "contains-any-of",
      label: "Contains any of",
      hasValue: true,
      ValueInput: TagMultiInput,
      predicate: containsAnyOf,
    },
    {
      id: "contains-all-of",
      label: "Contains all of",
      hasValue: true,
      ValueInput: TagMultiInput,
      predicate: containsAllOf,
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
