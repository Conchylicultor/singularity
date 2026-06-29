import type { AppIcon } from "../../core";
import { SvgIcon } from "@plugins/primitives/plugins/icon-picker/web";

export function AppIconView({ icon, className }: { icon: AppIcon; className?: string }) {
  switch (icon.kind) {
    case "md":
      return <SvgIcon nodes={icon.svgNodes} className={className} />;
  }
}
