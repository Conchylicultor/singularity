import { Mail } from "../slots";

/**
 * Rail-icon overlay for the Mail app. Renders every `Mail.RailBadge`
 * contribution; each surface paints its own attention dot (or nothing), so the
 * shell never names an individual surface's attention state.
 */
export function MailRailBadge() {
  return (
    <Mail.RailBadge.Render>
      {(badge) => <badge.component />}
    </Mail.RailBadge.Render>
  );
}
