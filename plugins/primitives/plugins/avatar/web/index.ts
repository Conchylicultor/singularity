import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { Avatar, type AvatarProps } from "./components/avatar";
export { AvatarPicker, type AvatarPickerProps, type AvatarSpec } from "./components/avatar-picker";
export {
  AVATAR_COLORS,
  AVATAR_COLOR_KEYS,
  avatarColorClass,
  type AvatarColor,
} from "./internal/colors";
export { DEFAULT_AGENT_AVATAR } from "./internal/default-avatar";

export default {
  description: "Reusable circular avatar (icon + color) with an optional status-dot overlay and a chooser popover. Reusable circular avatar (icon + color) with an optional status-dot overlay and a chooser popover.",
  contributions: [],
} satisfies PluginDefinition;
