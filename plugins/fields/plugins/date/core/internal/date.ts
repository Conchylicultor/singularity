import { MdCalendarToday } from "react-icons/md";
import { defineFieldType, defineFieldIdentity } from "@plugins/fields/core";

export const dateFieldType = defineFieldType<Date>("date");

export const dateIdentity = defineFieldIdentity<Date>({
  type: dateFieldType,
  label: "Date",
  icon: MdCalendarToday,
  coerce: (v) =>
    v instanceof Date
      ? v.getTime()
      : v == null
        ? null
        : new Date(v as string).getTime(),
});
