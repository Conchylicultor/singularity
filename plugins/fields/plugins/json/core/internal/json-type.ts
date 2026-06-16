import { MdDataObject } from "react-icons/md";
import { defineFieldType, defineFieldIdentity } from "@plugins/fields/core";

export const jsonFieldType = defineFieldType<unknown>("json");

// No `coerce`: a JSON blob has no meaningful sortable/comparable scalar
// projection (mirrors the `object` field identity, which omits it too).
export const jsonIdentity = defineFieldIdentity<unknown>({
  type: jsonFieldType,
  label: "JSON",
  icon: MdDataObject,
});
