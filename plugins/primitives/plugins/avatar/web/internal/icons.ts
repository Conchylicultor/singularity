import type { IconType } from "react-icons";
import {
  MdAutoAwesome,
  MdBolt,
  MdBookmark,
  MdBrush,
  MdBugReport,
  MdBuild,
  MdCloud,
  MdCode,
  MdDescription,
  MdEdit,
  MdExtension,
  MdFavorite,
  MdFlag,
  MdGroup,
  MdHelp,
  MdHome,
  MdInsights,
  MdLightbulb,
  MdLocalFireDepartment,
  MdMemory,
  MdPalette,
  MdPerson,
  MdPlayArrow,
  MdPrecisionManufacturing,
  MdPsychology,
  MdRocket,
  MdSchool,
  MdScience,
  MdSearch,
  MdSettings,
  MdShield,
  MdStar,
  MdTerminal,
  MdTimer,
  MdTune,
  MdVisibility,
  MdWorkOutline,
} from "react-icons/md";

// Curated icon registry. Keys are stable identifiers stored on rows;
// the React component is resolved at render time. Adding a new icon = add
// a new entry here — old rows referencing it just light up.

export const AVATAR_ICONS: Record<string, IconType> = {
  robot: MdPrecisionManufacturing,
  rocket: MdRocket,
  bug: MdBugReport,
  code: MdCode,
  build: MdBuild,
  brain: MdPsychology,
  bolt: MdBolt,
  star: MdStar,
  flag: MdFlag,
  fire: MdLocalFireDepartment,
  search: MdSearch,
  lightbulb: MdLightbulb,
  science: MdScience,
  shield: MdShield,
  cloud: MdCloud,
  terminal: MdTerminal,
  memory: MdMemory,
  palette: MdPalette,
  brush: MdBrush,
  edit: MdEdit,
  doc: MdDescription,
  bookmark: MdBookmark,
  favorite: MdFavorite,
  visibility: MdVisibility,
  insights: MdInsights,
  tune: MdTune,
  settings: MdSettings,
  extension: MdExtension,
  school: MdSchool,
  person: MdPerson,
  group: MdGroup,
  home: MdHome,
  work: MdWorkOutline,
  play: MdPlayArrow,
  timer: MdTimer,
  help: MdHelp,
  sparkle: MdAutoAwesome,
};

export const AVATAR_ICON_KEYS = Object.keys(AVATAR_ICONS);

export function resolveAvatarIcon(key: string | null | undefined): IconType | null {
  if (!key) return null;
  return AVATAR_ICONS[key] ?? null;
}

// Sensible default for agent avatars when the agent has no icon/color set.
// Used by both the agents plugin's row + title-prefix renderers and the
// agent detail page's picker.
export const DEFAULT_AGENT_AVATAR = { icon: "robot", color: "violet" } as const;
