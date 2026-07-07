import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import {
  WebsitePage,
  WebsiteToolbar,
} from "@plugins/apps/plugins/website/plugins/shell/web";
import { WebsiteAgents } from "./slots";

/**
 * The Agents pillar pane at `/website/agent-manager` — the story of the
 * builder: the agent manager that grows the workspace. Opts into the shared
 * site header (`WebsiteToolbar`) like every website pane, and renders every
 * `WebsiteAgents.Section` contribution top-to-bottom inside `WebsitePage` so
 * the site footer renders exactly once.
 *
 * Segment is `agent-manager` (not `agents`): pane segments are GLOBALLY
 * unique across all registered panes, and `agents` is taken by the
 * agent-manager app's root pane.
 */
export const agentsPane = Pane.define({
  id: "website-agents",
  segment: "agent-manager",
  chrome: { header: WebsiteToolbar },
  component: AgentsBody,
});

function AgentsBody() {
  return (
    <PaneChrome pane={agentsPane}>
      <WebsitePage>
        <WebsiteAgents.Section.Render />
      </WebsitePage>
    </PaneChrome>
  );
}
