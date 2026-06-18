import { MdFingerprint } from "react-icons/md";
import { defineFieldType, defineFieldIdentity } from "@plugins/fields/core";
import { textFieldType } from "@plugins/fields/plugins/text/core";

export const uuidFieldType = defineFieldType<string>("uuid");

export const uuidIdentity = defineFieldIdentity<string>({
  type: uuidFieldType,
  label: "UUID",
  icon: MdFingerprint,
  extends: textFieldType,
});
