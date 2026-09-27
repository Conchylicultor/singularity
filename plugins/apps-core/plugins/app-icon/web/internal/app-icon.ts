import { symbol } from "@plugins/ui/plugins/icons/core";
import { appIcon, type AppIcon } from "../../core";

/** Fallback icon for tabs/windows whose owning app cannot be resolved. */
export const DEFAULT_APP_ICON: AppIcon = appIcon(symbol("web-asset"));
