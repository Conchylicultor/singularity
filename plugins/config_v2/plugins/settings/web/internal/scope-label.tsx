import { useCallback, type ReactNode } from "react";
import { MdLayers } from "react-icons/md";
import { Apps } from "@plugins/apps-core/web";
import { AppIconView } from "@plugins/apps-core/plugins/app-icon/web";
import { scopeAppId } from "@plugins/config_v2/core";

/** How one scope is named on screen. `scopeId` undefined = the base document. */
export interface ScopeDisplay {
  label: string;
  icon: ReactNode;
}

/**
 * The one spelling of "what do we call this scope".
 *
 * Both the scope tabs and everything that has to NAME a scope it isn't showing
 * — a nav badge's tooltip, the detail pane's "the conflict is over there"
 * banner — resolve through this, so a scope can't be "Website" in one place and
 * `app:website` in another. An `app:<id>` with no installed app falls back to
 * the raw id (a committed scope for an app this build doesn't have).
 */
export function useScopeDisplay(): (
  scopeId: string | undefined,
) => ScopeDisplay {
  const apps = Apps.App.useContributions();
  return useCallback(
    (scopeId: string | undefined): ScopeDisplay => {
      if (!scopeId) return { label: "Base", icon: null };
      const rawId = scopeAppId(scopeId);
      const entry = apps.find((a) => a.id === rawId);
      if (entry) {
        return {
          label: entry.app.name,
          icon: <AppIconView icon={entry.icon} />,
        };
      }
      return { label: rawId ?? scopeId, icon: <MdLayers /> };
    },
    [apps],
  );
}
