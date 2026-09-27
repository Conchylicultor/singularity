import { defineFieldType, defineFieldIdentity } from "@plugins/fields/core";
import { symbol } from "@plugins/ui/plugins/icons/core";

const faceIcon = symbol("face");

export interface SvgNode {
  tag: string;
  attr: Record<string, string>;
  child: SvgNode[];
}

export interface AvatarSpec {
  icon: string | null;
  color: string | null;
  svgNodes: SvgNode[] | null;
}

export const avatarFieldType = defineFieldType<AvatarSpec>("avatar");

export const avatarIdentity = defineFieldIdentity<AvatarSpec>({
  type: avatarFieldType,
  label: "Avatar",
  icon: faceIcon,
  coerce: (v) => v?.icon ?? "",
});
