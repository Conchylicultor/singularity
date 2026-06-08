import { MdDataObject } from "react-icons/md";
import { defineFieldType, defineFieldIdentity } from "@plugins/fields/core";

export const objectFieldType = defineFieldType<Record<string, unknown>>("object");

export const objectIdentity = defineFieldIdentity<Record<string, unknown>>({
  type: objectFieldType,
  label: "Object",
  icon: MdDataObject,
});
