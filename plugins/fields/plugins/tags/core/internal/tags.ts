import { MdLabel } from "react-icons/md";
import { defineFieldType, defineFieldIdentity } from "@plugins/fields/core";

export const tagsFieldType = defineFieldType<string[]>("tags");

export const tagsIdentity = defineFieldIdentity<string[]>({
  type: tagsFieldType,
  label: "Tags",
  icon: MdLabel,
});
