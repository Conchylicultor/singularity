import type { ComponentType } from "react";
import type { IconType } from "react-icons";
import { MdWebAsset } from "react-icons/md";
import { extractSvgNodes } from "@plugins/primitives/plugins/icon-picker/web";
import type { AppIcon } from "../../core";
import { AppIconView } from "../components/app-icon-view";

/** Author an app's icon from a tree-shaken react-icons component: `icon: mdAppIcon(MdHome)`. */
export function mdAppIcon(Icon: IconType): AppIcon {
  return { kind: "md", svgNodes: extractSvgNodes(Icon) };
}

/** Fallback icon for tabs/windows whose owning app cannot be resolved. */
export const DEFAULT_APP_ICON: AppIcon = mdAppIcon(MdWebAsset);

/**
 * Adapter for generic icon-prop boundaries whose `icon` prop is typed
 * `ComponentType<{ className? }>` (e.g. the `ui/tab-bar` `Tab` primitive and
 * `IconButton`). Memoized on the stable `AppIcon` object so the returned
 * component identity is stable (no per-render remount).
 */
const componentCache = new WeakMap<AppIcon, ComponentType<{ className?: string }>>();
export function appIconComponent(icon: AppIcon): ComponentType<{ className?: string }> {
  let Cached = componentCache.get(icon);
  if (!Cached) {
    Cached = function AppIconGlyph({ className }: { className?: string }) {
      return <AppIconView icon={icon} className={className} />;
    };
    componentCache.set(icon, Cached);
  }
  return Cached;
}
