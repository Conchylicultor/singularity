import { MdList } from "react-icons/md";
import { defineFieldType, defineFieldIdentity } from "@plugins/fields/core";

export const enumFieldType = defineFieldType<string>("enum");

export const enumIdentity = defineFieldIdentity<string>({
  type: enumFieldType,
  label: "Select",
  icon: MdList,
  coerce: (v) => (typeof v === "string" ? v : String(v ?? "")),
  directionLabels: { asc: "A → Z", desc: "Z → A" },
});
