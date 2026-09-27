import { defineFieldType, defineFieldIdentity } from "@plugins/fields/core";
import { numberFieldType } from "@plugins/fields/plugins/number/core";
import { symbol } from "@plugins/ui/plugins/icons/core";

const numbersIcon = symbol("numbers");

export const floatFieldType = defineFieldType<number>("float");

export const floatIdentity = defineFieldIdentity<number>({
  type: floatFieldType,
  label: "Float",
  icon: numbersIcon,
  extends: numberFieldType,
  coerce: (v) => Number(v),
});
