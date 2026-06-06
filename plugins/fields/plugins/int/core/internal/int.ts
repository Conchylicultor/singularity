import { MdNumbers } from "react-icons/md";
import { defineFieldType, defineFieldIdentity } from "@plugins/fields/core";
import { numberFieldType } from "@plugins/fields/plugins/number/core";

export const intFieldType = defineFieldType<number>("int");

export const intIdentity = defineFieldIdentity<number>({
  type: intFieldType,
  label: "Integer",
  icon: MdNumbers,
  extends: numberFieldType,
  coerce: (v) => Math.trunc(Number(v)),
});
