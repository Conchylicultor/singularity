import { MdKey } from "react-icons/md";
import { defineFieldType, defineFieldIdentity } from "@plugins/fields/core";

export const secretFieldType = defineFieldType<string>("secret");

export const secretIdentity = defineFieldIdentity<string>({
  type: secretFieldType,
  label: "Secret",
  icon: MdKey,
});
