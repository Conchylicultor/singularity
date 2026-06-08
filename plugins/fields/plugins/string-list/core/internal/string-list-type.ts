import { MdFormatListBulleted } from "react-icons/md";
import { defineFieldType, defineFieldIdentity } from "@plugins/fields/core";

export const stringListFieldType = defineFieldType<string[]>("string-list");

export const stringListIdentity = defineFieldIdentity<string[]>({
  type: stringListFieldType,
  label: "String List",
  icon: MdFormatListBulleted,
});
