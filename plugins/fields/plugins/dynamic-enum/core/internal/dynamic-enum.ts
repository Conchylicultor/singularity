import { MdArrowDropDownCircle } from "react-icons/md";
import { defineFieldType, defineFieldIdentity } from "@plugins/fields/core";

export const dynamicEnumFieldType = defineFieldType<string>("dynamic-enum");

export const dynamicEnumIdentity = defineFieldIdentity<string>({
  type: dynamicEnumFieldType,
  label: "Dynamic Select",
  icon: MdArrowDropDownCircle,
  coerce: (v) => String(v ?? ""),
});
