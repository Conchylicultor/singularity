import { MdColorLens } from "react-icons/md";
import { defineFieldType, defineFieldIdentity } from "@plugins/fields/core";

export const colorFieldType = defineFieldType<string>("color");

export const colorIdentity = defineFieldIdentity<string>({
  type: colorFieldType,
  label: "Color",
  icon: MdColorLens,
  coerce: (v) => String(v ?? ""),
});
