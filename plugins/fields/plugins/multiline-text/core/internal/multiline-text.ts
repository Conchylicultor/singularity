import { MdNotes } from "react-icons/md";
import { defineFieldType, defineFieldIdentity } from "@plugins/fields/core";
import { textFieldType } from "@plugins/fields/plugins/text/core";

export const multilineTextFieldType = defineFieldType<string>("multiline-text");

export const multilineTextIdentity = defineFieldIdentity<string>({
  type: multilineTextFieldType,
  label: "Long text",
  icon: MdNotes,
  extends: textFieldType,
  coerce: (v) => (typeof v === "string" ? v : String(v ?? "")),
});
