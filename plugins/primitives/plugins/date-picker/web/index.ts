import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { Calendar, type CalendarProps } from "./components/calendar";
export { TimeField, type TimeFieldProps } from "./components/time-field";
export {
  DatePickerPanel,
  type DatePickerPanelProps,
} from "./components/date-picker-panel";
export {
  DatePickerPopover,
  type DatePickerPopoverProps,
} from "./components/date-picker-popover";

export default {
  description:
    "Themed date-picker primitive: <Calendar> month grid, <TimeField> native clock input, <DatePickerPanel> (presets + calendar + time + clear), and <DatePickerPopover>. Day math lives in core/ and is local-calendar, never UTC.",
  contributions: [],
} satisfies PluginDefinition;
