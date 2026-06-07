import { MdNumbers } from "react-icons/md";
import { defineFieldType, defineFieldIdentity } from "@plugins/fields/core";
import { numberFieldType } from "@plugins/fields/plugins/number/core";

export const floatFieldType = defineFieldType<number>("float");

export const floatIdentity = defineFieldIdentity<number>({
  type: floatFieldType,
  label: "Float",
  icon: MdNumbers,
  extends: numberFieldType,
  coerce: (v) => Number(v),
});
