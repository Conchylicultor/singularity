import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

import { CONTROL_UTILITY_GROUPS } from "@/theme/control-utilities";

const { controlHeight, controlIcon, controlMin, pad } = CONTROL_UTILITY_GROUPS;

type CustomGroupId =
  (typeof CONTROL_UTILITY_GROUPS)[keyof typeof CONTROL_UTILITY_GROUPS]["groupId"];

const twMerge = extendTailwindMerge<CustomGroupId>({
  extend: {
    classGroups: {
      [controlHeight.groupId]: [...controlHeight.classes],
      [controlIcon.groupId]: [...controlIcon.classes],
      [controlMin.groupId]: [...controlMin.classes],
      [pad.groupId]: [...pad.classes],
    },
    conflictingClassGroups: {
      size: [controlHeight.groupId, controlIcon.groupId],
      h: [controlHeight.groupId, controlIcon.groupId],
      w: [controlIcon.groupId],
      "min-h": [controlMin.groupId],
      p: [pad.groupId],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
