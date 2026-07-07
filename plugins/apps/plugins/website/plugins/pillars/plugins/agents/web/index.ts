import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { WebsiteToolbar } from "@plugins/apps/plugins/website/plugins/shell/web";
import { agentsPane } from "./panes";
import { WebsiteAgents } from "./slots";
import { AgentsNavItem } from "./components/agents-nav-item";
import { AgentsHero } from "./components/agents-hero";
import { AgentsHowItWorks } from "./components/agents-how-it-works";
import { AgentsClosing } from "./components/agents-closing";

export { agentsPane } from "./panes";
export { WebsiteAgents } from "./slots";

export default {
  description:
    "Agents pillar page of the equin website: the /website/agents pane telling the agent-manager story (nested tasks, isolated worktrees, the race), its Agents nav link, and the WebsiteAgents.Section slot demo plugins contribute into.",
  contributions: [
    Pane.Register({ pane: agentsPane }),
    WebsiteToolbar.End({ id: "agents", component: AgentsNavItem }),
    WebsiteAgents.Section({ id: "hero", label: "Hero", component: AgentsHero }),
    WebsiteAgents.Section({
      id: "how-it-works",
      label: "How it works",
      component: AgentsHowItWorks,
    }),
    WebsiteAgents.Section({
      id: "closing",
      label: "Closing links",
      component: AgentsClosing,
    }),
  ],
} satisfies PluginDefinition;
