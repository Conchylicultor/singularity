// Canonical names of the custom @utility classes declared in app.css, grouped by
// which built-in tailwind-merge group must override them when it appears later in
// a class string. Imported by lib/utils.ts (twMerge config) and verified against
// app.css by the app-css-utilities-in-sync check. app.css is the CSS mirror.

export const CONTROL_HEIGHT_UTILITIES = ["control-xs", "control-sm", "control-md", "control-lg"] as const;
export const CONTROL_ICON_UTILITIES = ["control-icon-xs", "control-icon-sm", "control-icon-md", "control-icon-lg"] as const;
export const CONTROL_MIN_UTILITIES = ["control-min-xs", "control-min-sm", "control-min-md", "control-min-lg"] as const;
export const PAD_UTILITIES = ["p-chip", "p-control", "p-row"] as const;
export const ICON_AUTO_UTILITY = "icon-auto" as const;

export const CONTROL_UTILITY_GROUPS = {
  controlHeight: { groupId: "sg-control-height", classes: CONTROL_HEIGHT_UTILITIES },
  controlIcon: { groupId: "sg-control-icon", classes: CONTROL_ICON_UTILITIES },
  controlMin: { groupId: "sg-control-min", classes: CONTROL_MIN_UTILITIES },
  pad: { groupId: "sg-pad", classes: PAD_UTILITIES },
} as const;
