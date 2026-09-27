import { defineFieldType, defineFieldIdentity } from "@plugins/fields/core";
import { numberFieldType } from "@plugins/fields/plugins/number/core";
import { symbol } from "@plugins/ui/plugins/icons/core";

const numbersIcon = symbol("numbers");

export const intFieldType = defineFieldType<number>("int");

export const intIdentity = defineFieldIdentity<number>({
  type: intFieldType,
  label: "Integer",
  icon: numbersIcon,
  extends: numberFieldType,
  coerce: (v) => Math.trunc(Number(v)),
});
