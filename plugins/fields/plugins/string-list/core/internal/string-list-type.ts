import { defineFieldType, defineFieldIdentity } from "@plugins/fields/core";
import { symbol } from "@plugins/ui/plugins/icons/core";

const formatListBulletedIcon = symbol("format-list-bulleted");

export const stringListFieldType = defineFieldType<string[]>("string-list");

export const stringListIdentity = defineFieldIdentity<string[]>({
  type: stringListFieldType,
  label: "String List",
  icon: formatListBulletedIcon,
});
