import { MdToggleOn } from "react-icons/md";
import { defineFieldType, defineFieldIdentity } from "@plugins/fields/core";

export const boolFieldType = defineFieldType<boolean>("bool");

export const boolIdentity = defineFieldIdentity<boolean>({
  type: boolFieldType,
  label: "Boolean",
  icon: MdToggleOn,
  coerce: (v) => (v ? 1 : 0),
});
