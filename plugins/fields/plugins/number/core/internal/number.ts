import { MdNumbers } from "react-icons/md";
import { defineFieldType, defineFieldIdentity } from "@plugins/fields/core";

export const numberFieldType = defineFieldType<number>("number");

export const numberIdentity = defineFieldIdentity<number>({
  type: numberFieldType,
  label: "Number",
  icon: MdNumbers,
  customColumn: true,
  coerce: (v) => (typeof v === "number" ? v : Number(v)),
  directionLabels: { asc: "1 → 9", desc: "9 → 1" },
});
