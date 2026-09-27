import { defineFieldType, defineFieldIdentity } from "@plugins/fields/core";
import { textFieldType } from "@plugins/fields/plugins/text/core";
import { symbol } from "@plugins/ui/plugins/icons/core";

const fingerprintIcon = symbol("fingerprint");

export const uuidFieldType = defineFieldType<string>("uuid");

export const uuidIdentity = defineFieldIdentity<string>({
  type: uuidFieldType,
  label: "UUID",
  icon: fingerprintIcon,
  extends: textFieldType,
});
