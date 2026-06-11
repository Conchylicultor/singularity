import { Settings } from "../slots";

/**
 * Rail-icon overlay for the Settings app. Renders every `Settings.RailBadge`
 * contribution; each surface paints its own attention dot (or nothing), so the
 * shell never names an individual surface's attention state.
 */
export function SettingsRailBadge() {
  return (
    <Settings.RailBadge.Render>
      {(badge) => <badge.component />}
    </Settings.RailBadge.Render>
  );
}
