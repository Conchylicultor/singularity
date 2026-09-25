import type { FilterOperatorSet } from "@plugins/primitives/plugins/data-view/web";
import { TextValueInput } from "./components/text-filter";
import { textLower } from "./internal/text-lower";

export const textOperatorSet: FilterOperatorSet = {
  match: "text",
  domain: "text",
  defaultOperator: "contains",
  operators: [
    {
      id: "contains",
      label: "Contains",
      hasValue: true,
      ValueInput: TextValueInput,
      lower: textLower.contains,
    },
    {
      id: "does-not-contain",
      label: "Does not contain",
      hasValue: true,
      ValueInput: TextValueInput,
      lower: textLower["does-not-contain"],
    },
    {
      id: "is",
      label: "Is",
      hasValue: true,
      ValueInput: TextValueInput,
      lower: textLower.is,
    },
    {
      id: "is-not",
      label: "Is not",
      hasValue: true,
      ValueInput: TextValueInput,
      lower: textLower["is-not"],
    },
    {
      id: "is-empty",
      label: "Is empty",
      hasValue: false,
      lower: textLower["is-empty"],
    },
    {
      id: "is-not-empty",
      label: "Is not empty",
      hasValue: false,
      lower: textLower["is-not-empty"],
    },
  ],
};
