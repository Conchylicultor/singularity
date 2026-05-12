import type { PluginDefinition } from "@core";

export { Avatar, type AvatarProps, type AvatarSize } from "./components/avatar";
export { AvatarPicker, type AvatarPickerProps, type AvatarSpec } from "./components/avatar-picker";
export {
  AVATAR_COLORS,
  AVATAR_COLOR_KEYS,
  avatarColorClass,
  type AvatarColor,
} from "./internal/colors";
export {
  AVATAR_ICONS,
  AVATAR_ICON_KEYS,
  AVATAR_ICON_CATEGORIES_FLAT as AVATAR_ICON_CATEGORIES,
  DEFAULT_AGENT_AVATAR,
  resolveAvatarIcon,
  searchIcons,
  loadFullIconSet,
  type AvatarIconCategory,
  type FullIconSet,
  type FullIconEntry,
  type FullIconCategory,
} from "./internal/icons";

export default {
  id: "avatar",
  name: "Avatar",
  description: "Reusable circular avatar (icon + color) with an optional status-dot overlay and a chooser popover.",
  contributions: [],
} satisfies PluginDefinition;
