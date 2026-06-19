import { MdTextFields } from "react-icons/md";
import { defineFieldType, defineFieldIdentity } from "@plugins/fields/core";

export const textFieldType = defineFieldType<string>("text");

export const textIdentity = defineFieldIdentity<string>({
  type: textFieldType,
  label: "Text",
  icon: MdTextFields,
  coerce: (v) => (typeof v === "string" ? v : String(v ?? "")),
  directionLabels: { asc: "A → Z", desc: "Z → A" },
});
