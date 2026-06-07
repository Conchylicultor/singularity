import { MdImage } from "react-icons/md";
import { defineFieldType, defineFieldIdentity } from "@plugins/fields/core";

export const imageFieldType = defineFieldType<string>("image");

export const imageIdentity = defineFieldIdentity<string>({
  type: imageFieldType,
  label: "Image",
  icon: MdImage,
  coerce: (v) => String(v ?? ""),
});
