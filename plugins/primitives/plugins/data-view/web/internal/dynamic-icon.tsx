import type { ComponentType } from "react";

export function DynamicIcon({ icon: Icon }: { icon?: ComponentType }) {
  return Icon ? <Icon /> : null;
}
