import type { ReactElement } from "react";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { useActiveMembership } from "@plugins/plugin-meta/plugins/composition/web";
import { MembershipSummary } from "./membership-summary";

/**
 * Section host for the membership summary. `membership` is null for the frame
 * before the pane's seed effect populates the active-composition store, and
 * whenever the draft is cleared.
 */
export function MembershipSummarySection(): ReactElement {
  const membership = useActiveMembership();

  if (!membership) {
    return (
      <Text variant="caption" tone="muted">
        No active composition.
      </Text>
    );
  }

  return <MembershipSummary membership={membership} />;
}
